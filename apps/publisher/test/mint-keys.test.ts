import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { denominations } from "../src/bids";
import { hashHex, publicKey, unhex } from "../src/crypto";
import { config, keysetId, mintKeys } from "./fixtures";

test("complete v1 and v2 mint keysets retain large denominations while spending safe amounts", () => {
  const entries = Array.from(
    { length: 64 },
    (_, i) =>
      [
        String(1n << BigInt(i)),
        publicKey(
          unhex(
            BigInt(i + 1)
              .toString(16)
              .padStart(64, "0"),
          ),
        ),
      ] as const,
  );
  const keys = Object.fromEntries(entries.toReversed());
  const ids = [
    "00" +
      hashHex(
        Buffer.concat(entries.map(([, key]) => Buffer.from(key, "hex"))),
      ).slice(0, 14),
    "01" +
      hashHex(
        entries.map(([amount, key]) => `${amount}:${key}`).join(",") +
          "|unit:sat",
      ),
  ];
  for (const id of ids) {
    const mint = {
      url: "https://mint.example",
      keysets: [{ id, unit: "sat", active: true, keys }],
    };
    const saved = config({ mints: [mint] }).mints[0]!.keysets[0]!;
    expect(saved.keys).toEqual(keys);
    expect(denominations(7, saved)).toEqual([4, 2, 1]);
    expect(
      denominations(Number.MAX_SAFE_INTEGER, saved).reduce(
        (sum, n) => sum + n,
        0,
      ),
    ).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => denominations(2 ** 53, saved)).toThrow("invalid_amount");
    const truncated = { ...keys };
    delete truncated[String(1n << 63n)];
    expect(() =>
      config({
        mints: [
          { ...mint, keysets: [{ ...mint.keysets[0], keys: truncated }] },
        ],
      }),
    ).toThrow("Mint keyset ID does not match saved keys");
  }
});

test("mint-keys CLI normalizes null, omitted, and populated wire metadata into usable snapshots", async () => {
  let metadata: {
    input_fee_ppk?: number | null;
    final_expiry?: number | null;
  } = {};
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/v1/keysets")
        return Response.json({
          keysets: [{ id: keysetId, unit: "sat", active: true, ...metadata }],
        });
      if (path === `/v1/keys/${keysetId}`)
        return Response.json({
          keysets: [{ id: keysetId, unit: "sat", keys: mintKeys }],
        });
      return new Response(null, { status: 404 });
    },
  });
  try {
    for (metadata of [
      { input_fee_ppk: null, final_expiry: null },
      {},
      { input_fee_ppk: 0 },
      { input_fee_ppk: 100, final_expiry: 2000000000 },
    ]) {
      const process = Bun.spawn(
        [
          Bun.which("bun")!,
          fileURLToPath(new URL("../src/mint-keys.ts", import.meta.url)),
          server.url.origin,
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(process.stdout).text(),
        new Response(process.stderr).text(),
        process.exited,
      ]);
      expect(stderr).toBe("");
      expect(exitCode).toBe(0);
      const snapshot = JSON.parse(stdout);
      const saved = config({ mints: [snapshot] }).mints[0]!.keysets[0]!;
      expect(saved.input_fee_ppk).toBe(metadata.input_fee_ppk ?? 0);
      expect(saved.final_expiry).toBe(metadata.final_expiry ?? undefined);
    }
  } finally {
    await server.stop(true);
  }
}, 10000);
