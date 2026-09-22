import { expect, test } from "bun:test";
import { hashToCurve, verifyDleq, verifyProofDleq } from "../src/crypto";

// Independent published vectors: https://github.com/cashubtc/nuts/blob/main/tests/00-tests.md
test("Cashu NUT-00 hash-to-curve vectors", () => {
  const points = [
    "024cce997d3b518f739663b757deaec95bcd9473c30a14ac2fd04023a739d1a725",
    "022e7158e11c9506f1aa4248bf531298daa7febd6194f003edcd9b93ade6253acf",
    "026cdbe15362df59cd1dd3c9c11de8aedac2106eca69236ecd9fbe117af897be4f",
  ];
  points.forEach((point, i) =>
    expect(
      hashToCurve("\0".repeat(31) + String.fromCharCode(i)).toHex(true),
    ).toBe(point),
  );
});

// https://github.com/cashubtc/nuts/blob/main/tests/12-tests.md
test("Cashu NUT-12 blinded and unblinded DLEQ vectors", () => {
  const A =
    "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
  const B =
    "02a9acc1e48c25eeeb9289b5031cc57da9fe72f3fe2861d264bdc074209b107ba2";
  const e = "9818e061ee51d5c8edc3342369a554998ff7b4381c8652d724cdf46429be73d9";
  const s = "9818e061ee51d5c8edc3342369a554998ff7b4381c8652d724cdf46429be73da";
  expect(verifyDleq(B, B, A, e, s)).toBe(true);
  expect(verifyDleq(B, B, A, e, e)).toBe(false);
  const secret =
    "daf4dd00a2b68a0858a80450f52c8a7d2ccf87d375e43e216e0c571f089f63e9";
  const C =
    "024369d2d22a80ecf78f3937da9d5f30c1b9f74f0c32684d583cca0fa6a61cdcfc";
  const dleq = {
    e: "b31e58ac6527f34975ffab13e70a48b6d2b0d35abc4b03f0151f09ee1a9763d4",
    s: "8fbae004c59e754d71df67e392b6ae4e29293113ddc2ec86592a0431d16306d8",
    r: "a6d13fcd7a18442e6076f5e1e7c887ad5de40a019824bdfa9fe740d302e8d861",
  };
  expect(verifyProofDleq(secret, C, A, dleq)).toBe(true);
  expect(verifyProofDleq(secret + "x", C, A, dleq)).toBe(false);
});
