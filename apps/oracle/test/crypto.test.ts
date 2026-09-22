import { expect, test } from "bun:test";
import { schnorr } from "@noble/curves/secp256k1.js";
import {
  hashHex,
  hex,
  commitmentDigest,
  keyIdentity,
  sha256,
  swapDigest,
  unhex,
  verifySignature,
} from "../src/crypto";
import { verifyPayment } from "../src/payment";
import { authorizationSchema, bidRequestSchema } from "../src/schemas";
import vectors from "./fixtures/cashu-sig-all.json";
import complete from "./fixtures/rob-authorization.json";
import { compressed, keys, makeFixture, tokenOf } from "./fixture";

test("reproduces the published NUT-11 digest and verifies every supplied swap signature", () => {
  expect(
    hex(swapDigest(vectors.swaps[0]!.inputs, vectors.swaps[0]!.outputs)),
  ).toBe(vectors.first_digest);
  for (const swap of vectors.swaps) {
    const digest = swapDigest(swap.inputs, swap.outputs);
    const secret = JSON.parse(swap.inputs[0]!.secret)[1] as {
      data: string;
      tags: string[][];
    };
    const publicKeys = [
      secret.data,
      ...secret.tags
        .filter((t) => t[0] === "pubkeys" || t[0] === "refund")
        .flatMap((t) => t.slice(1)),
    ];
    const signatures = JSON.parse(swap.inputs[0]!.witness!)
      .signatures as string[];
    for (const signature of signatures) {
      expect(
        publicKeys.some((key) =>
          verifySignature(signature, digest, key.slice(2)),
        ),
      ).toBe(true);
      expect(
        publicKeys.some((key) =>
          verifySignature(signature, sha256(digest), key.slice(2)),
        ),
      ).toBe(false);
    }
  }
});

test("SIG_ALL retains exact strings, hex case and order, and excludes keyset IDs and input amounts", () => {
  const swap = vectors.swaps[0]!;
  const original = hex(swapDigest(swap.inputs, swap.outputs));
  const mutated = structuredClone(swap);
  mutated.inputs[0]!.amount += 1;
  mutated.inputs[0]!.id = "00".repeat(8);
  mutated.outputs[0]!.id = "00".repeat(8);
  expect(hex(swapDigest(mutated.inputs, mutated.outputs))).toBe(original);
  for (const mutation of [
    () => {
      mutated.inputs[0]!.secret += " ";
    },
    () => {
      mutated.inputs[0]!.C = mutated.inputs[0]!.C.toUpperCase();
    },
    () => {
      mutated.outputs[0]!.B_ = mutated.outputs[0]!.B_.toUpperCase();
    },
    () => {
      mutated.outputs[0]!.amount++;
    },
  ]) {
    Object.assign(mutated, structuredClone(swap));
    mutation();
    expect(hex(swapDigest(mutated.inputs, mutated.outputs))).not.toBe(original);
  }
  const fixture = makeFixture();
  const inputs = tokenOf(fixture.auth)
    .t.flatMap((t) => t.p)
    .map((p) => ({ secret: p.s, C: hex(p.c) }));
  expect(hex(swapDigest(inputs, fixture.auth.outputs))).not.toBe(
    hex(swapDigest([...inputs].reverse(), fixture.auth.outputs)),
  );
  expect(hex(swapDigest(inputs, fixture.auth.outputs))).not.toBe(
    hex(swapDigest(inputs, [...fixture.auth.outputs].reverse())),
  );
});

test("complete ROB fixture verifies original hashes, refund-key commitment, and keyset/proof order", () => {
  const auth = authorizationSchema.parse(complete.auth);
  const terms = bidRequestSchema.parse(JSON.parse(auth.request.content));
  const payment = verifyPayment(
    auth.payment,
    terms,
    auth.commitment.bidder_pubkey,
  );
  expect(payment.grossAmount).toBe(8n);
  expect(payment.inputs.map((p) => p.secret)).toEqual(
    tokenOf(auth).t.flatMap((g) => g.p.map((p) => p.s)),
  );
  expect(hashHex(auth.payment)).toBe(auth.commitment.payment_hash);
  expect(hashHex(auth.creative.content)).toBe(auth.commitment.creative_hash);
  expect(
    schnorr.verify(
      unhex(auth.commitment.sig),
      commitmentDigest(auth, terms.impression_id),
      unhex(payment.refundKey),
    ),
  ).toBe(true);
  const original = hex(commitmentDigest(auth, terms.impression_id));
  for (const mutate of [
    () => {
      auth.creative.height++;
    },
    () => {
      auth.request.id = "00".repeat(32);
    },
  ]) {
    mutate();
    expect(hex(commitmentDigest(auth, terms.impression_id))).not.toBe(original);
  }
  expect(hex(commitmentDigest(complete.auth, "other"))).not.toBe(original);
});

test("Cashu identity ignores compressed parity and hex case", () => {
  const pubkey = compressed(keys.oracle);
  expect(keyIdentity(pubkey)).toBe(
    keyIdentity("03" + pubkey.slice(2).toUpperCase()),
  );
});
