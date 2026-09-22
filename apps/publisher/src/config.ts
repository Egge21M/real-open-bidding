import { z } from "zod";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { readFileSync } from "node:fs";
import { compressedKey, hex32, keysetSchema } from "./schemas";
import { hashHex, unhex } from "./crypto";
import { parseJson } from "./json";

export const secureUrl = z.url().refine((value) => {
  const url = new URL(value);
  return (
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    (url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
  );
});
const origin = secureUrl
  .refine((s) => new URL(s).pathname === "/")
  .transform((s) => new URL(s).origin);
export const configSchema = z.strictObject({
  publicUrl: origin,
  allowedOrigins: z.array(origin).min(1),
  relays: z
    .array(
      z.url().refine((s) => {
        const u = new URL(s);
        return (
          !u.username &&
          !u.password &&
          !u.hash &&
          (u.protocol === "wss:" ||
            (u.protocol === "ws:" &&
              ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)))
        );
      }),
    )
    .min(1),
  oracle: z.strictObject({
    pubkey: hex32,
    payment_pubkey: compressedKey,
    pixel_base: secureUrl,
    authorizationUrl: secureUrl,
  }),
  mints: z
    .array(
      z.strictObject({
        url: secureUrl.refine((s) => !s.endsWith("/")),
        keysets: z.array(keysetSchema).min(1),
      }),
    )
    .min(1),
  databasePath: z.string().min(1).default("data/publisher.sqlite"),
  hostname: z.string().default("127.0.0.1"),
  port: z.int().min(0).max(65535).default(3001),
  auctionSeconds: z.int().min(1).max(30).default(2),
  workerIntervalMs: z.int().min(100).max(60000).default(1000),
  networkTimeoutMs: z.int().min(100).max(30000).default(5000),
  maxConcurrentAuctions: z.int().min(1).max(10000).default(100),
  maxBidsPerAuction: z.int().min(1).max(10000).default(100),
});
export type PublisherConfig = z.infer<typeof configSchema> & {
  identityKey: Uint8Array;
  paymentSeed: Uint8Array;
};

export function validateConfig(
  value: unknown,
  identityKey: Uint8Array,
  paymentSeed: Uint8Array,
): PublisherConfig {
  const config = configSchema.parse(value);
  if (
    !secp256k1.utils.isValidSecretKey(identityKey) ||
    paymentSeed.length !== 32
  )
    throw new Error("Invalid publisher keys");
  const mintUrls = new Set<string>();
  for (const mint of config.mints) {
    if (mintUrls.has(mint.url)) throw new Error("Duplicate mint");
    mintUrls.add(mint.url);
    const ids = new Set<string>();
    for (const keyset of mint.keysets) {
      if (ids.has(keyset.id)) throw new Error("Duplicate keyset");
      ids.add(keyset.id);
      const entries = Object.entries(keyset.keys).sort((a, b) =>
        BigInt(a[0]) < BigInt(b[0]) ? -1 : 1,
      );
      if (!entries.length) throw new Error("Empty keyset");
      for (const [amount, key] of entries) {
        const n = BigInt(amount);
        // Keep the complete keyset for ID verification, including denominations
        // larger than supported transaction amounts. The amount keys are strings.
        if ((n & (n - 1n)) !== 0n)
          throw new Error("Unsupported keyset denomination");
        secp256k1.Point.fromHex(key).assertValidity();
      }
      const derived = keyset.id.startsWith("00")
        ? "00" +
          hashHex(
            Buffer.concat(entries.map(([, key]) => Buffer.from(key, "hex"))),
          ).slice(0, 14)
        : "01" +
          hashHex(
            entries
              .map(([amount, key]) => `${amount}:${key.toLowerCase()}`)
              .join(",") +
              "|unit:sat" +
              (keyset.input_fee_ppk
                ? `|input_fee_ppk:${keyset.input_fee_ppk}`
                : "") +
              (keyset.final_expiry
                ? `|final_expiry:${keyset.final_expiry}`
                : ""),
          );
      if (derived !== keyset.id)
        throw new Error("Mint keyset ID does not match saved keys");
    }
    if (!mint.keysets.some((k) => k.active))
      throw new Error("Mint needs an active output keyset");
  }
  if (config.oracle.pixel_base.endsWith("/"))
    throw new Error("Pixel base must not end with slash");
  secp256k1.Point.fromHex(config.oracle.payment_pubkey).assertValidity();
  return { ...config, identityKey, paymentSeed };
}

export function readConfig(
  env: Record<string, string | undefined> = process.env,
): PublisherConfig {
  try {
    return validateConfig(
      parseJson(readFileSync(env.PUBLISHER_CONFIG ?? "publisher.json", "utf8")),
      unhex(hex32.parse(env.PUBLISHER_IDENTITY_PRIVATE_KEY)),
      unhex(hex32.parse(env.PUBLISHER_PAYMENT_SEED)),
    );
  } catch {
    throw new Error(
      "Invalid publisher configuration: check PUBLISHER_CONFIG, saved mint keys, PUBLISHER_IDENTITY_PRIVATE_KEY and PUBLISHER_PAYMENT_SEED",
    );
  }
}
