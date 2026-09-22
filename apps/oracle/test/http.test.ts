import { expect, test } from "bun:test";
import { createOracle, MAX_BODY_BYTES } from "../src/app";
import { openStore } from "../src/store";
import {
  config,
  NOW,
  makeFixture,
  httpRequest,
  independentlyVerifySpend,
} from "./fixture";
import fixture from "./fixtures/rob-authorization.json";

test("Bun HTTP serves a pixel and authorizes behind the configured public origin", async () => {
  const store = openStore(":memory:");
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    maxRequestBodySize: MAX_BODY_BYTES,
    fetch: createOracle(config, store, () => NOW),
  });
  try {
    const pixel = await fetch(
      new URL(new URL(fixture.pixelUrl).pathname, server.url),
    );
    expect(pixel.status).toBe(200);
    expect(
      Buffer.from(await pixel.arrayBuffer())
        .subarray(0, 6)
        .toString(),
    ).toBe("GIF89a");
    const response = await fetch(new URL("/authorize", server.url), {
      method: "POST",
      body: JSON.stringify(fixture.auth),
      headers: {
        "content-type": "application/json",
        authorization: fixture.httpAuthorization,
        "x-forwarded-host": "attacker.example",
        "x-forwarded-proto": "http",
      },
    });
    expect(response.status).toBe(200);
    const result = (await response.json()) as { signature: string };
    expect(independentlyVerifySpend(fixture.auth, result.signature).valid).toBe(
      true,
    );
    const retry = httpRequest(fixture.auth);
    const repeated = await fetch(new URL("/authorize", server.url), {
      method: "POST",
      headers: retry.headers,
      body: await retry.text(),
    });
    expect(await repeated.json()).toEqual(result);
    const head = await fetch(
      new URL(
        new URL(makeFixture({ nonce: "aa".repeat(16) }).pixelUrl).pathname,
        server.url,
      ),
      { method: "HEAD" },
    );
    expect(head.status).toBe(405);
  } finally {
    await server.stop(true);
    store.close();
  }
});
