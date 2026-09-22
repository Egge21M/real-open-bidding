import { decode, Tokenizer, Type } from "cborg";
import { z } from "zod";
import { hex, keyIdentity } from "./crypto";
import { PublisherError, requireCondition } from "./errors";
import { decodeUtf8, parseJson } from "./json";
import { compressedKey, mintUrl, type BidRequest } from "./schemas";

const bytes = (length: number) =>
  z.instanceof(Uint8Array).refine((b) => b.length === length);
const tokenSchema = z.object({
  m: mintUrl,
  u: z.literal("sat"),
  d: z.string().optional(),
  t: z
    .array(
      z.object({
        i: z
          .instanceof(Uint8Array)
          .refine((b) => b.length === 8 || b.length === 33),
        p: z
          .array(
            z.object({
              a: z.union([z.int().positive(), z.bigint().positive()]),
              s: z.string().min(1),
              c: bytes(33).refine((b) => b[0] === 2 || b[0] === 3),
              d: z
                .object({ e: bytes(32), s: bytes(32), r: bytes(32) })
                .optional(),
              w: z.never().optional(),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
});
const secretSchema = z.tuple([
  z.literal("P2PK"),
  z.object({
    nonce: z.string().min(1),
    data: compressedKey,
    tags: z.array(z.array(z.string()).min(2)),
  }),
]);
const knownTags = new Set([
  "pubkeys",
  "n_sigs",
  "sigflag",
  "locktime",
  "refund",
  "n_sigs_refund",
]);

export function decodePayment(payment: string) {
  requireCondition(
    /^cashuB[A-Za-z0-9_-]+={0,2}$/.test(payment),
    "invalid_payment",
  );
  const encoded = payment.slice(6);
  const raw = new Uint8Array(Buffer.from(encoded, "base64url"));
  requireCondition(
    Buffer.from(raw).toString("base64url") === encoded.replace(/=+$/, ""),
    "invalid_payment",
  );
  const options = {
    rejectDuplicateMapKeys: true,
    allowUndefined: false,
    allowNaN: false,
    allowInfinity: false,
    retainStringBytes: true,
  };
  const tokenizer = new Tokenizer(raw, options);
  try {
    const value: unknown = decode(raw, {
      ...options,
      tokenizer: {
        done: () => tokenizer.done(),
        pos: () => tokenizer.pos(),
        next() {
          const token = tokenizer.next();
          if (token.type === Type.string) decodeUtf8(token.byteValue!);
          return token;
        },
      },
    });
    // NUT-00 requires ignoring unknown token fields. Keep the original payment
    // string for its commitment; parsing never replaces or re-encodes that string.
    return tokenSchema.parse(value);
  } catch {
    throw new PublisherError(400, "invalid_payment");
  }
}

export function verifyPayment(
  payment: string,
  terms: BidRequest,
  bidder: string,
) {
  const token = decodePayment(payment);
  requireCondition(terms.mints.includes(token.m), "mint_not_accepted");
  try {
    const publisher = keyIdentity(terms.publisher_payment_pubkey);
    const oracle = keyIdentity(terms.oracle.payment_pubkey);
    requireCondition(publisher !== oracle, "invalid_payment_conditions");
    let conditions: string | undefined;
    let refundKey = "";
    let grossAmount = 0n;
    const secrets = new Set<string>();
    const inputs = token.t.flatMap((group) =>
      group.p.map((proof) => {
        requireCondition(!secrets.has(proof.s), "duplicate_inputs");
        secrets.add(proof.s);
        const [kind, secret] = secretSchema.parse(parseJson(proof.s));
        const currentConditions = JSON.stringify([
          kind,
          secret.data,
          secret.tags,
        ]);
        requireCondition(
          conditions === undefined || conditions === currentConditions,
          "mixed_payment_conditions",
        );
        conditions = currentConditions;
        const tags = new Map<string, string[]>();
        for (const [name, ...values] of secret.tags) {
          if (knownTags.has(name!)) {
            requireCondition(!tags.has(name!), "invalid_payment_conditions");
            tags.set(name!, values);
          }
        }
        const single = (name: string) => {
          const values = tags.get(name);
          requireCondition(values?.length === 1, "invalid_payment_conditions");
          return values[0]!;
        };
        requireCondition(
          single("sigflag") === "SIG_ALL",
          "invalid_payment_conditions",
        );
        const positiveInteger = (value: string) => {
          requireCondition(
            /^[0-9]+$/.test(value),
            "invalid_payment_conditions",
          );
          const integer = BigInt(value);
          requireCondition(integer > 0n, "invalid_payment_conditions");
          return integer;
        };
        requireCondition(
          positiveInteger(single("n_sigs")) === 2n,
          "invalid_payment_conditions",
        );
        requireCondition(
          positiveInteger(single("n_sigs_refund")) === 1n,
          "invalid_payment_conditions",
        );
        positiveInteger(single("locktime"));
        const dataKey = keyIdentity(secret.data);
        const additionalKey = keyIdentity(
          compressedKey.parse(single("pubkeys")),
        );
        requireCondition(
          dataKey !== additionalKey &&
            [dataKey, additionalKey].includes(publisher) &&
            [dataKey, additionalKey].includes(oracle),
          "invalid_payment_conditions",
        );
        refundKey = keyIdentity(compressedKey.parse(single("refund")));
        requireCondition(refundKey !== bidder, "invalid_payment_conditions");
        grossAmount += BigInt(proof.a);
        return { secret: proof.s, C: hex(proof.c) };
      }),
    );
    return { inputs, refundKey, grossAmount };
  } catch (error) {
    if (error instanceof PublisherError) throw error;
    throw new PublisherError(400, "invalid_payment_conditions");
  }
}
