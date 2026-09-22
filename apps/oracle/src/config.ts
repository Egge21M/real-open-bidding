import { z } from "zod";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hex, unhex } from "./crypto";
import { hex32 } from "./schemas";

const environmentSchema = z.object({
  ORACLE_PUBLIC_URL: z.url().refine((value) => {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return (
      (url.protocol === "https:" || (local && url.protocol === "http:")) &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    );
  }, "Use an HTTPS origin (or loopback HTTP for development)"),
  ORACLE_PUBKEY: hex32.refine((key) => {
    try {
      secp256k1.Point.fromHex("02" + key).assertValidity();
      return true;
    } catch {
      return false;
    }
  }),
  ORACLE_PAYMENT_PRIVATE_KEY: hex32.refine((key) =>
    secp256k1.utils.isValidSecretKey(unhex(key)),
  ),
  ORACLE_DATABASE_PATH: z.string().min(1).default("data/oracle.sqlite"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});

export function readConfig(
  env: Record<string, string | undefined> = process.env,
) {
  const parsed = environmentSchema.safeParse(env);
  if (!parsed.success) {
    // Do not include secret environment values in startup diagnostics.
    throw new Error(
      `Invalid oracle configuration: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  }
  const values = parsed.data;
  const origin = new URL(values.ORACLE_PUBLIC_URL).origin;
  const privateKey = unhex(values.ORACLE_PAYMENT_PRIVATE_KEY);
  return {
    authorizationUrl: `${origin}/authorize`,
    pixelBase: `${origin}/pixel`,
    identity: values.ORACLE_PUBKEY,
    paymentPubkey: hex(secp256k1.getPublicKey(privateKey, true)),
    privateKey,
    databasePath: values.ORACLE_DATABASE_PATH,
    hostname: values.HOST,
    port: values.PORT,
  };
}
export type OracleConfig = ReturnType<typeof readConfig>;
