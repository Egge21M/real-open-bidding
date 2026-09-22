import { z } from "zod";

export const hex32 = z.string().regex(/^[0-9a-f]{64}$/);
export const signature = z.string().regex(/^[0-9a-f]{128}$/);
export const compressedKey = z.string().regex(/^(02|03)[0-9a-fA-F]{64}$/);
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
    publisher_payment_pubkey: compressedKey,
    oracle: z.strictObject({
      pubkey: hex32,
      payment_pubkey: compressedKey,
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

export const bidSchema = z.strictObject({
  version: z.literal(1),
  bid_request_id: hex32,
  impression_id: impressionId,
  bid_nonce: bidNonce,
  amount_sat: z.int().positive(),
  creative: z.strictObject({
    type: z.literal("html"),
    content: z
      .string()
      .min(1)
      .max(128 * 1024),
    width: dimension,
    height: dimension,
  }),
  payment: z
    .string()
    .startsWith("cashuB")
    .max(256 * 1024),
  commitment: authorizationSchema.shape.commitment,
});
export type Bid = z.infer<typeof bidSchema>;

const publicText = z
  .string()
  .max(2048)
  .refine((s) => s.isWellFormed());
export const contextSchema = z.strictObject({
  site: z
    .strictObject({
      page: z.url().max(2048).optional(),
      name: publicText.optional(),
      cat: z.array(z.string().max(64)).max(32).optional(),
      content: z
        .strictObject({
          title: publicText.optional(),
          language: z.string().max(64).optional(),
          keywords: publicText.optional(),
        })
        .optional(),
    })
    .optional(),
  device: z
    .strictObject({
      ua: publicText.optional(),
      language: z.string().max(64).optional(),
      w: z.int().positive().max(65536).optional(),
      h: z.int().positive().max(65536).optional(),
      dnt: z.union([z.literal(0), z.literal(1)]).optional(),
    })
    .optional(),
});
export const loadSchema = z.strictObject({
  placement: impressionId,
  sizes: z
    .array(
      z.strictObject({
        width: dimension.max(8192),
        height: dimension.max(8192),
      }),
    )
    .min(1)
    .max(32),
  context: contextSchema.optional(),
});

export const keysetSchema = z.strictObject({
  id: z.string().regex(/^(00[0-9a-f]{14}|01[0-9a-f]{64})$/),
  unit: z.literal("sat"),
  active: z.boolean(),
  input_fee_ppk: z.int().nonnegative().default(0),
  final_expiry: z.int().positive().optional(),
  keys: z.record(z.string().regex(/^[1-9][0-9]*$/), compressedKey),
});
export type Keyset = z.infer<typeof keysetSchema>;
