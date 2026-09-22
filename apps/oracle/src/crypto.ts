import { createHash } from "node:crypto";
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
