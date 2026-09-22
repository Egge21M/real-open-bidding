import { createHash } from "node:crypto";
import { schnorr, secp256k1 } from "@noble/curves/secp256k1.js";
import { decode, encode } from "cborg";
import type {
  AuthorizationRequest,
  BidRequest,
  SignedEvent,
} from "../src/schemas";
import { readConfig } from "../src/config";

// Public, deterministic test keys. Never use these for deployed funds.
const key = (n: number) =>
  Uint8Array.from([...new Array<number>(31).fill(0), n]);
export const keys = {
  publisher: key(1),
  publisherPayment: key(2),
  oracle: key(3),
  oracleIdentity: key(4),
  bidder: key(5),
  refund: key(6),
  stranger: key(7),
};
export const NOW = 1_800_000_000;
const hex = (value: Uint8Array) => Buffer.from(value).toString("hex");
const digest = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest();
export const xonly = (key: Uint8Array) => hex(schnorr.getPublicKey(key));
export const compressed = (key: Uint8Array) =>
  hex(secp256k1.getPublicKey(key, true));
const sign = (hash: Uint8Array, key: Uint8Array) =>
  hex(schnorr.sign(hash, key, new Uint8Array(32)));
export const config = readConfig({
  ORACLE_PUBLIC_URL: "https://oracle.example",
  ORACLE_PUBKEY: xonly(keys.oracleIdentity),
  ORACLE_PAYMENT_PRIVATE_KEY: hex(keys.oracle),
  ORACLE_DATABASE_PATH: ":memory:",
});

export function signEvent(
  event: Omit<SignedEvent, "id" | "sig" | "pubkey">,
  key: Uint8Array,
): SignedEvent {
  const pubkey = xonly(key);
  const id = digest(
    JSON.stringify([
      0,
      pubkey,
      event.created_at,
      event.kind,
      event.tags,
      event.content,
    ]),
  );
  return { ...event, pubkey, id: hex(id), sig: sign(id, key) };
}

export function sealCommitment(
  auth: AuthorizationRequest,
  refundKey = keys.refund,
) {
  const terms = JSON.parse(auth.request.content) as BidRequest;
  auth.commitment.payment_hash = hex(digest(auth.payment));
  auth.commitment.creative_hash = hex(digest(auth.creative.content));
  const context = digest(
    JSON.stringify([
      auth.request.id,
      terms.impression_id,
      auth.bid_nonce,
      "html",
      auth.creative.width,
      auth.creative.height,
    ]),
  );
  const tag = digest("ROB/commitment/v1");
  const hash = digest(
    Buffer.concat([
      tag,
      tag,
      Buffer.from(auth.commitment.payment_hash, "hex"),
      Buffer.from(auth.commitment.creative_hash, "hex"),
      Buffer.from(auth.commitment.bidder_pubkey, "hex"),
      context,
    ]),
  );
  auth.commitment.sig = sign(hash, refundKey);
  return auth;
}

export type FixtureToken = {
  m: string;
  u: string;
  d?: string;
  t: {
    i: Uint8Array;
    p: { a: number | bigint; s: string; c: Uint8Array; w?: string }[];
  }[];
};
export function tokenOf(auth: AuthorizationRequest): FixtureToken {
  return decode(
    Buffer.from(auth.payment.slice(6), "base64url"),
  ) as FixtureToken;
}
export function setToken(auth: AuthorizationRequest, token: FixtureToken) {
  auth.payment = "cashuB" + Buffer.from(encode(token)).toString("base64url");
  return sealCommitment(auth);
}
export function changeSecrets(
  auth: AuthorizationRequest,
  change: (
    secret: [string, { nonce: string; data: string; tags: string[][] }],
    index: number,
  ) => void,
) {
  const token = tokenOf(auth);
  token.t
    .flatMap((t) => t.p)
    .forEach((proof, i) => {
      const secret = JSON.parse(proof.s);
      change(secret, i);
      proof.s = JSON.stringify(secret);
    });
  return setToken(auth, token);
}

export function makeFixture(
  options: {
    request?: SignedEvent;
    nonce?: string;
    terms?: (terms: BidRequest) => void;
    html?: (pixel: string) => string;
  } = {},
) {
  const terms: BidRequest = {
    version: 1,
    impression_id: "imp-1",
    banner_sizes: [{ width: 300, height: 250 }],
    site: { domain: "publisher.example" },
    closes_at: NOW - 5,
    mints: ["https://mint.example"],
    publisher_payment_pubkey: compressed(keys.publisherPayment),
    oracle: {
      pubkey: config.identity,
      payment_pubkey: config.paymentPubkey,
      pixel_base: config.pixelBase,
    },
  };
  options.terms?.(terms);
  const request =
    options.request ??
    signEvent(
      {
        kind: 28300,
        created_at: NOW - 10,
        tags: [],
        content: JSON.stringify(terms),
      },
      keys.publisher,
    );
  const requestTerms = JSON.parse(request.content) as BidRequest;
  const nonce = options.nonce ?? "00112233445566778899aabbccddeeff";
  const pixelUrl = `${requestTerms.oracle.pixel_base}/${request.id}/${requestTerms.impression_id}/${nonce}`;
  const tags = [
    ["pubkeys", requestTerms.oracle.payment_pubkey],
    ["n_sigs", "2"],
    ["sigflag", "SIG_ALL"],
    ["locktime", String(NOW + 30)],
    ["refund", compressed(keys.refund)],
    ["n_sigs_refund", "1"],
  ];
  const token: FixtureToken = {
    m: requestTerms.mints[0]!,
    u: "sat",
    t: [
      {
        i: new Uint8Array([0, 0, 0, 0, 0, 0, 0, 1]),
        p: [
          {
            a: 4,
            s: JSON.stringify([
              "P2PK",
              {
                nonce: `first-${nonce}`,
                data: requestTerms.publisher_payment_pubkey,
                tags,
              },
            ]),
            c: secp256k1.getPublicKey(key(8), true),
          },
        ],
      },
      {
        i: new Uint8Array([1, ...new Array<number>(31).fill(0), 2]),
        p: [
          {
            a: 4,
            s: JSON.stringify([
              "P2PK",
              {
                nonce: `second-${nonce}`,
                data: requestTerms.publisher_payment_pubkey,
                tags,
              },
            ]),
            c: secp256k1.getPublicKey(key(9), true),
          },
        ],
      },
    ],
  };
  const auth: AuthorizationRequest = {
    request,
    payment: "cashuB" + Buffer.from(encode(token)).toString("base64url"),
    bid_nonce: nonce,
    creative: {
      content:
        options.html?.(pixelUrl) ??
        `<p>Example ☃</p><img src="${pixelUrl}" width="1" height="1">`,
      width: 300,
      height: 250,
    },
    commitment: {
      bidder_pubkey: xonly(keys.bidder),
      creative_hash: "",
      payment_hash: "",
      sig: "",
    },
    outputs: [
      { amount: 4, B_: compressed(key(10)) },
      { amount: 3, B_: compressed(key(11)) },
    ],
  };
  return { auth: sealCommitment(auth), pixelUrl };
}

export function httpRequest(
  auth: AuthorizationRequest,
  options: {
    now?: number;
    body?: string;
    signer?: Uint8Array;
    tags?: string[][];
    editEvent?: (event: Omit<SignedEvent, "id" | "sig" | "pubkey">) => void;
  } = {},
) {
  const body = options.body ?? JSON.stringify(auth);
  const event = {
    kind: 27235,
    created_at: options.now ?? NOW,
    content: "",
    tags: options.tags ?? [
      ["u", config.authorizationUrl],
      ["method", "POST"],
      ["payload", hex(digest(body))],
    ],
  };
  options.editEvent?.(event);
  const signed = signEvent(event, options.signer ?? keys.publisher);
  return new Request(config.authorizationUrl, {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      authorization: `Nostr ${Buffer.from(JSON.stringify(signed)).toString("base64")}`,
    },
  });
}

export function independentlyVerifySpend(
  auth: AuthorizationRequest,
  signature: string,
) {
  const inputs = tokenOf(auth).t.flatMap((t) => t.p);
  const preimage =
    inputs.map((p) => p.s + hex(p.c)).join("") +
    auth.outputs.map((p) => String(p.amount) + p.B_).join("");
  const hash = digest(preimage);
  const publisherSignature = sign(hash, keys.publisherPayment);
  return {
    valid: schnorr.verify(
      Buffer.from(signature, "hex"),
      hash,
      schnorr.getPublicKey(keys.oracle),
    ),
    publisherValid: schnorr.verify(
      Buffer.from(publisherSignature, "hex"),
      hash,
      schnorr.getPublicKey(keys.publisherPayment),
    ),
    witness: JSON.stringify({ signatures: [signature, publisherSignature] }),
  };
}
