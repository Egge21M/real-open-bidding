import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Database } from "bun:sqlite";
import { openStore } from "../src/store";
import {
  config,
  keys,
  makeFixture,
  httpRequest,
  independentlyVerifySpend,
} from "./fixture";

test("independent Bun processes share one durable authorization decision", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rob-runtime-"));
  const path = join(dir, "oracle.sqlite");
  const children: ReturnType<typeof Bun.spawn>[] = [];
  try {
    const a = makeFixture();
    const b = makeFixture({ request: a.auth.request, nonce: "33".repeat(16) });
    const store = openStore(path);
    store.observe(a.auth.request.id, "imp-1", a.auth.bid_nonce, 1);
    store.observe(b.auth.request.id, "imp-1", b.auth.bid_nonce, 1);
    store.close();
    async function start() {
      const probe = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch: () => new Response(),
      });
      const port = probe.port!;
      await probe.stop(true);
      const child = Bun.spawn([process.execPath, "src/index.ts"], {
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        env: {
          ...process.env,
          ORACLE_PUBLIC_URL: "https://oracle.example",
          ORACLE_PUBKEY: config.identity,
          ORACLE_PAYMENT_PRIVATE_KEY: Buffer.from(keys.oracle).toString("hex"),
          ORACLE_DATABASE_PATH: path,
          HOST: "127.0.0.1",
          PORT: String(port),
        },
        stdout: "pipe",
        stderr: "pipe",
      });
      children.push(child);
      const reader = child.stdout.getReader();
      let output = "";
      try {
        while (!output.includes("Oracle listening")) {
          const result = await reader.read();
          if (result.done) throw new Error("Oracle exited before listening");
          output += new TextDecoder().decode(result.value);
        }
      } finally {
        reader.releaseLock();
      }
      return `http://127.0.0.1:${port}/authorize`;
    }
    const urls = await Promise.all([start(), start()]);
    const responses = await Promise.all(
      [a, b].map(async (fixture, i) => {
        const request = httpRequest(fixture.auth, {
          now: Math.floor(Date.now() / 1000),
        });
        return fetch(urls[i]!, {
          method: "POST",
          headers: request.headers,
          body: await request.text(),
        });
      }),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const winner = responses.findIndex((r) => r.status === 200);
    const result = (await responses[winner]!.json()) as { signature: string };
    expect(
      independentlyVerifySpend([a, b][winner]!.auth, result.signature).valid,
    ).toBe(true);
    const retry = httpRequest([a, b][winner]!.auth, {
      now: Math.floor(Date.now() / 1000),
    });
    const repeated = await fetch(urls[1 - winner]!, {
      method: "POST",
      headers: retry.headers,
      body: await retry.text(),
    });
    expect(await repeated.json()).toEqual(result);
    const db = new Database(path, { readonly: true });
    try {
      expect(
        db.query("SELECT count(*) AS count FROM authorizations").get(),
      ).toEqual({ count: 1 });
    } finally {
      db.close();
    }
  } finally {
    for (const child of children) child.kill();
    await Promise.all(children.map((child) => child.exited));
    rmSync(dir, { recursive: true, force: true });
  }
}, 20_000);
