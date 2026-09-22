import { encode } from "cborg";
import { schnorr, secp256k1 } from "@noble/curves/secp256k1.js";
import { nip44 } from "nostr-tools";
import { validateConfig, type PublisherConfig } from "../src/config";
import {
  hashHex,
  hashToCurve,
  hex,
  unhex,
  scalar,
  scalarHex,
  publicKey,
  randomHex,
  signEvent,
  eventDigest,
  commitmentDigest,
  signDigest,
} from "../src/crypto";
import type { Bid, SignedEvent } from "../src/schemas";

export const publisherKey = unhex("11".repeat(32));
export const seed = unhex("22".repeat(32));
export const oracleKey = unhex("33".repeat(32));
export const bidderKey = unhex("44".repeat(32));
export const refundKey = unhex("55".repeat(32));
export const bidderIdentity = hex(schnorr.getPublicKey(bidderKey));
export const mintSecrets = Object.fromEntries(
  [1, 2, 4, 8, 16, 32, 64, 128, 256].map((n) => [n, BigInt(n + 100)]),
);
export const mintKeys = Object.fromEntries(
  Object.entries(mintSecrets).map(([n, k]) => [
    n,
    secp256k1.Point.BASE.multiply(k).toHex(true),
  ]),
);
export const keysetId =
  "00" +
  hashHex(
    Buffer.concat(
      Object.entries(mintKeys)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([, key]) => Buffer.from(key, "hex")),
    ),
  ).slice(0, 14);
export function config(
  overrides: Record<string, unknown> = {},
): PublisherConfig {
  return validateConfig(
    {
      publicUrl: "https://publisher.example",
      allowedOrigins: ["https://site.example"],
      relays: ["wss://relay.example"],
      oracle: {
        pubkey: hex(schnorr.getPublicKey(oracleKey)),
        payment_pubkey: publicKey(oracleKey),
        pixel_base: "https://oracle.example/pixel",
        authorizationUrl: "https://oracle.example/authorize",
      },
      mints: [
        {
          url: "https://mint.example",
          keysets: [
            {
              id: keysetId,
              unit: "sat",
              active: true,
              input_fee_ppk: 100,
              keys: mintKeys,
            },
          ],
        },
      ],
      databasePath: ":memory:",
      ...overrides,
    },
    publisherKey,
    seed,
  );
}

export function mintPromise(B_: string, amount: number) {
  const k = mintSecrets[amount]!;
  const B = secp256k1.Point.fromHex(B_);
  const A = secp256k1.Point.BASE.multiply(k);
  const C = B.multiply(k);
  const nonce = (scalar(randomHex()) % (secp256k1.Point.Fn.ORDER - 1n)) + 1n;
  const R1 = secp256k1.Point.BASE.multiply(nonce);
  const R2 = B.multiply(nonce);
  const e = hashHex([R1, R2, A, C].map((p) => p.toHex(false)).join(""));
  const s = scalarHex((nonce + scalar(e) * k) % secp256k1.Point.Fn.ORDER);
  return { id: keysetId, amount, C_: C.toHex(true), dleq: { e, s } };
}

export function fundedBid(
  request: SignedEvent,
  options: {
    amount?: number;
    refundAt?: number;
    nonce?: string;
    html?: string;
    width?: number;
    height?: number;
  } = {},
): Bid {
  const terms = JSON.parse(request.content);
  const amount = options.amount ?? 8;
  const nonce = options.nonce ?? randomHex().slice(0, 32);
  const secret = JSON.stringify([
    "P2PK",
    {
      nonce: randomHex(),
      data: terms.publisher_payment_pubkey,
      tags: [
        ["pubkeys", terms.oracle.payment_pubkey],
        ["n_sigs", "2"],
        ["sigflag", "SIG_ALL"],
        ["locktime", String(options.refundAt ?? terms.closes_at + 120)],
        ["refund", publicKey(refundKey)],
        ["n_sigs_refund", "1"],
      ],
    },
  ]);
  const r = (scalar(randomHex()) % (secp256k1.Point.Fn.ORDER - 1n)) + 1n;
  const Y = hashToCurve(secret);
  const B = Y.add(secp256k1.Point.BASE.multiply(r));
  const promise = mintPromise(B.toHex(true), amount);
  const C = Y.multiply(mintSecrets[amount]!);
  const token = {
    m: "https://mint.example",
    u: "sat",
    t: [
      {
        i: unhex(keysetId),
        p: [
          {
            a: amount,
            s: secret,
            c: unhex(C.toHex(true)),
            d: {
              e: unhex(promise.dleq.e),
              s: unhex(promise.dleq.s),
              r: unhex(scalarHex(r)),
            },
          },
        ],
      },
    ],
  };
  const payment = "cashuB" + Buffer.from(encode(token)).toString("base64url");
  const width = options.width ?? 300,
    height = options.height ?? 250;
  const content =
    options.html ??
    `<a href="https://advertiser.example" target="_blank">A banner</a><img src="${terms.oracle.pixel_base}/${request.id}/${terms.impression_id}/${nonce}" width="1" height="1">`;
  const commitment = {
    bidder_pubkey: bidderIdentity,
    creative_hash: hashHex(content),
    payment_hash: hashHex(payment),
    sig: "",
  };
  commitment.sig = signDigest(
    commitmentDigest(
      {
        request,
        payment,
        bid_nonce: nonce,
        creative: { content, width, height },
        commitment,
        outputs: [],
      },
      terms.impression_id,
    ),
    refundKey,
  );
  return {
    version: 1,
    bid_request_id: request.id,
    impression_id: terms.impression_id,
    bid_nonce: nonce,
    amount_sat: amount,
    creative: { type: "html", content, width, height },
    payment,
    commitment,
  };
}

export function wrapBid(bid: Bid, recipient: string): SignedEvent {
  const rumor = {
    kind: 28301,
    created_at: Math.floor(Date.now() / 1000),
    pubkey: bidderIdentity,
    tags: [
      ["p", recipient],
      ["e", bid.bid_request_id],
    ],
    content: JSON.stringify(bid),
  };
  const content = JSON.stringify({ ...rumor, id: hex(eventDigest(rumor)) });
  const seal = signEvent(
    {
      kind: 13,
      created_at: rumor.created_at - 100,
      tags: [],
      content: nip44.encrypt(
        content,
        nip44.getConversationKey(bidderKey, recipient),
      ),
    },
    bidderKey,
  );
  const ephemeral = secp256k1.utils.randomSecretKey();
  return signEvent(
    {
      kind: 21059,
      created_at: rumor.created_at - 200,
      tags: [["p", recipient]],
      content: nip44.encrypt(
        JSON.stringify(seal),
        nip44.getConversationKey(ephemeral, recipient),
      ),
    },
    ephemeral,
  );
}

export function loadRequest(
  origin = "https://site.example",
  value: unknown = {
    placement: "sidebar",
    sizes: [{ width: 300, height: 250 }],
  },
) {
  return new Request("https://publisher.example/v1/auctions", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(value),
  });
}
