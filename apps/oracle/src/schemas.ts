import { z } from "zod";
import { secp256k1 } from "@noble/curves/secp256k1.js";

export const hex32 = z.string().regex(/^[0-9a-f]{64}$/);
export const signature = z.string().regex(/^[0-9a-f]{128}$/);
export const compressedKey = z.string().regex(/^(02|03)[0-9a-fA-F]{64}$/);
const paymentKey = compressedKey.refine((value) => {
  try {
    secp256k1.Point.fromHex(value).assertValidity();
    return true;
  } catch {
    return false;
  }
});
export const impressionId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
export const bidNonce = z.string().regex(/^[0-9a-f]{32}$/);
const dimension = z.int().positive();
const httpUrl = z.url({ protocol: /^https?$/ }).refine((s) => {
  const url = new URL(s);
  return !url.username && !url.password && !url.hash;
});
export const mintUrl = httpUrl.refine(
  (s) => !s.endsWith("/") && !new URL(s).search,
);

export const eventSchema = z.strictObject({
  id: hex32,
  pubkey: hex32,
  created_at: z.int().nonnegative(),
  kind: z.int().nonnegative(),
  tags: z.array(z.array(z.string())),
  content: z.string(),
  sig: signature,
});
export type SignedEvent = z.infer<typeof eventSchema>;

const prohibitedContextKeys = new Set([
  "ip",
  "ipv6",
  "lat",
  "lon",
  "ifa",
  "didsha1",
  "didmd5",
  "dpidsha1",
  "dpidmd5",
  "macsha1",
  "macmd5",
]);
function hasProhibitedContext(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, child]) =>
      prohibitedContextKeys.has(key) || hasProhibitedContext(child),
  );
}

export const bidRequestSchema = z
  .strictObject({
    version: z.literal(1),
    impression_id: impressionId,
    banner_sizes: z
      .array(z.strictObject({ width: dimension, height: dimension }))
      .min(1),
    site: z.looseObject({ domain: z.string().min(1) }),
    device: z.record(z.string(), z.unknown()).optional(),
    closes_at: z.int().nonnegative(),
    mints: z.array(mintUrl).min(1),
    publisher_payment_pubkey: paymentKey,
    oracle: z.strictObject({
      pubkey: hex32,
      payment_pubkey: paymentKey,
      pixel_base: httpUrl.refine((s) => !s.endsWith("/") && !new URL(s).search),
    }),
  })
  .refine(
    (r) => !hasProhibitedContext(r.site) && !hasProhibitedContext(r.device),
    {
      message: "Public advertising context contains prohibited fields",
    },
  );
export type BidRequest = z.infer<typeof bidRequestSchema>;

export const authorizationSchema = z.strictObject({
  request: eventSchema,
  payment: z.string().startsWith("cashuB"),
  bid_nonce: bidNonce,
  creative: z.strictObject({
    content: z.string(),
    width: dimension,
    height: dimension,
  }),
  commitment: z.strictObject({
    bidder_pubkey: hex32,
    creative_hash: hex32,
    payment_hash: hex32,
    sig: signature,
  }),
  // Syntax only: payment/output validity is the publisher's responsibility.
  outputs: z
    .array(z.strictObject({ amount: z.int().nonnegative(), B_: compressedKey }))
    .min(1),
});
export type AuthorizationRequest = z.infer<typeof authorizationSchema>;
export type Output = AuthorizationRequest["outputs"][number];
