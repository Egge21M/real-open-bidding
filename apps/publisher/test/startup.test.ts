import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./fixtures";
import { hex } from "../src/crypto";

test("standalone process loads config, migrates SQLite, serves health and exposes local wallet status", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rob-startup-"));
  const { identityKey, paymentSeed, ...settings } = config({
    databasePath: join(dir, "publisher.sqlite"),
    hostname: "127.0.0.1",
    port: 0,
  });
  const configPath = join(dir, "publisher.json");
  writeFileSync(configPath, JSON.stringify(settings));
  const env = {
    ...process.env,
    PUBLISHER_CONFIG: configPath,
    PUBLISHER_IDENTITY_PRIVATE_KEY: hex(identityKey),
    PUBLISHER_PAYMENT_SEED: hex(paymentSeed),
  };
  const server = Bun.spawn(
    [
      process.execPath,
      fileURLToPath(new URL("../src/index.ts", import.meta.url)),
    ],
    { cwd: dir, env, stdout: "pipe", stderr: "pipe" },
  );
  try {
    const reader = server.stdout.getReader();
    const first = await reader.read();
    reader.releaseLock();
    const output = new TextDecoder().decode(first.value);
    const address = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
    if (!address)
      throw new Error(
        "Standalone publisher failed to start: " +
          (await new Response(server.stderr).text()),
      );
    const response = await fetch(address + "/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(statSync(settings.databasePath).mode & 0o777).toBe(0o600);
    const wallet = Bun.spawn(
      [
        process.execPath,
        fileURLToPath(new URL("../src/wallet.ts", import.meta.url)),
        "status",
      ],
      { cwd: dir, env, stdout: "pipe", stderr: "pipe" },
    );
    expect(await new Response(wallet.stdout).json()).toEqual({
      recordedProceeds: [],
      payments: [],
    });
    expect(await wallet.exited).toBe(0);
  } finally {
    server.kill("SIGTERM");
    await server.exited;
    rmSync(dir, { recursive: true, force: true });
  }
}, 10000);
