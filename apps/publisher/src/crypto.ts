import { createHash, createHmac, randomBytes } from "node:crypto";
import { schnorr, secp256k1 } from "@noble/curves/secp256k1.js";
import type { AuthorizationRequest, Output, SignedEvent } from "./schemas";

export const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
export const unhex = (value: string) =>
  Uint8Array.from(Buffer.from(value, "hex"));
export const sha256 = (value: string | Uint8Array) =>
  new Uint8Array(createHash("sha256").update(value).digest());
export const hashHex = (value: string | Uint8Array) => hex(sha256(value));

export function verifySignature(
  sig: string,
  digest: Uint8Array,
  pubkey: string,
): boolean {
  try {
    return schnorr.verify(unhex(sig), digest, unhex(pubkey));
  } catch {
    return false;
  }
}

export function eventDigest(
  event: Omit<SignedEvent, "id" | "sig">,
): Uint8Array {
  return sha256(
    JSON.stringify([
      0,
      event.pubkey,
      event.created_at,
      event.kind,
      event.tags,
      event.content,
    ]),
  );
}

export function verifyEvent(event: SignedEvent): boolean {
  const digest = eventDigest(event);
  return (
    hex(digest) === event.id && verifySignature(event.sig, digest, event.pubkey)
  );
}

export function keyIdentity(compressed: string): string {
  // Cashu Schnorr key identity is the x-coordinate, including for opposite parity keys.
  secp256k1.Point.fromHex(compressed).assertValidity();
  return compressed.slice(2).toLowerCase();
}

export function commitmentDigest(
  auth: AuthorizationRequest,
  impression: string,
): Uint8Array {
  // This fixed array contains only constrained ASCII strings and safe integers.
  // ECMAScript JSON serialization is exactly RFC 8785/JCS for this subset.
  const context = JSON.stringify([
    auth.request.id,
    impression,
    auth.bid_nonce,
    "html",
    auth.creative.width,
    auth.creative.height,
  ]);
  const tag = sha256("ROB/commitment/v1");
  return sha256(
    Buffer.concat([
      tag,
      tag,
      unhex(auth.commitment.payment_hash),
      unhex(auth.commitment.creative_hash),
      unhex(auth.commitment.bidder_pubkey),
      sha256(context),
    ]),
  );
}

export function swapDigest(
  inputs: { secret: string; C: string }[],
  outputs: Output[],
): Uint8Array {
  // NUT-11 SIG_ALL hashes the concatenated text once, retaining input/output order.
  const message =
    inputs.map((p) => p.secret + p.C).join("") +
    outputs.map((p) => String(p.amount) + p.B_).join("");
  return sha256(message);
}

export function signDigest(digest: Uint8Array, privateKey: Uint8Array): string {
  return hex(schnorr.sign(digest, privateKey));
}

export function signEvent(
  event: Omit<SignedEvent, "id" | "sig" | "pubkey">,
  privateKey: Uint8Array,
): SignedEvent {
  const unsigned = { ...event, pubkey: hex(schnorr.getPublicKey(privateKey)) };
  const digest = eventDigest(unsigned);
  return { ...unsigned, id: hex(digest), sig: signDigest(digest, privateKey) };
}

export function deriveAuctionKey(seed: Uint8Array): Uint8Array {
  for (;;) {
    const key = new Uint8Array(
      createHmac("sha256", seed)
        .update("ROB/publisher/auction/v1")
        .update(randomBytes(32))
        .digest(),
    );
    if (secp256k1.utils.isValidSecretKey(key)) return key;
  }
}

export const randomHex = () => randomBytes(32).toString("hex");
export const publicKey = (key: Uint8Array) =>
  hex(secp256k1.getPublicKey(key, true));

// Cashu NUT-00 hash_to_curve (separate from a generic hash-to-curve suite).
export function hashToCurve(secret: string) {
  const seed = sha256(
    Buffer.concat([
      Buffer.from("Secp256k1_HashToCurve_Cashu_"),
      Buffer.from(secret),
    ]),
  );
  for (let counter = 0; counter < 65_536; counter++) {
    const count = Buffer.alloc(4);
    count.writeUInt32LE(counter);
    try {
      return secp256k1.Point.fromHex(
        "02" + hashHex(Buffer.concat([seed, count])),
      );
    } catch {
      /* try next point */
    }
  }
  throw new Error("hash_to_curve_failed");
}

const order = secp256k1.Point.Fn.ORDER;
export const scalar = (s: string) => BigInt("0x" + s);
export const scalarHex = (n: bigint) => n.toString(16).padStart(64, "0");
const multiply = (p: typeof secp256k1.Point.BASE, n: bigint) =>
  n === 0n ? secp256k1.Point.ZERO : p.multiply(n);

export function verifyDleq(
  B: string,
  C: string,
  A: string,
  e: string,
  s: string,
): boolean {
  try {
    const challenge = scalar(e),
      response = scalar(s);
    if (challenge >= order || response >= order) return false;
    const b = secp256k1.Point.fromHex(B),
      c = secp256k1.Point.fromHex(C),
      a = secp256k1.Point.fromHex(A);
    const r1 = multiply(secp256k1.Point.BASE, response).subtract(
      multiply(a, challenge),
    );
    const r2 = multiply(b, response).subtract(multiply(c, challenge));
    return hashHex([r1, r2, a, c].map((p) => p.toHex(false)).join("")) === e;
  } catch {
    return false;
  }
}

export function verifyProofDleq(
  secret: string,
  C: string,
  A: string,
  dleq: { e: string; s: string; r: string },
): boolean {
  try {
    const r = scalar(dleq.r);
    if (r >= order) return false;
    const b = hashToCurve(secret).add(multiply(secp256k1.Point.BASE, r));
    const c = secp256k1.Point.fromHex(C).add(
      multiply(secp256k1.Point.fromHex(A), r),
    );
    return verifyDleq(b.toHex(true), c.toHex(true), A, dleq.e, dleq.s);
  } catch {
    return false;
  }
}

export function blind(secret: string, r: string): string {
  return hashToCurve(secret)
    .add(secp256k1.Point.BASE.multiply(scalar(r)))
    .toHex(true);
}
export function unblind(C: string, A: string, r: string): string {
  return secp256k1.Point.fromHex(C)
    .subtract(secp256k1.Point.fromHex(A).multiply(scalar(r)))
    .toHex(true);
}
