import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { createOracle, MAX_BODY_BYTES } from "../src/app";
import { openStore } from "../src/store";
import {
  config,
  NOW,
  keys,
  compressed,
  makeFixture,
  httpRequest,
  independentlyVerifySpend,
  sealCommitment,
  tokenOf,
  setToken,
  changeSecrets,
  signEvent,
} from "./fixture";
import type { AuthorizationRequest, BidRequest } from "../src/schemas";

const disposals: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposals.splice(0).reverse()) dispose();
});
function setup(path = ":memory:", clock = () => NOW) {
  const store = openStore(path);
  disposals.push(() => store.close());
  return { app: createOracle(config, store, clock), store };
}
function temporaryDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "rob-oracle-"));
  disposals.push(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, "oracle.sqlite");
}
async function observe(app: ReturnType<typeof createOracle>, pixel: string) {
  const response = await app(new Request(pixel));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("content-type")).toBe("image/gif");
}
async function expectError(response: Response, code: string, status = 400) {
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error: code });
}

test("complete local flow: missing pixel, callback, valid spend signature, immutable retry", async () => {
  const { app } = setup();
  const { auth, pixelUrl } = makeFixture();
  await expectError(await app(httpRequest(auth)), "pixel_not_observed", 409);
  await observe(app, pixelUrl);
  const success = await app(httpRequest(auth));
  expect(success.status).toBe(200);
  const result = (await success.json()) as { signature: string };
  expect(Object.keys(result)).toEqual(["signature"]);
  expect(result.signature).toMatch(/^[0-9a-f]{128}$/);
  const spend = independentlyVerifySpend(auth, result.signature);
  expect(spend.valid).toBe(true);
  expect(spend.publisherValid).toBe(true);
  expect(JSON.parse(spend.witness).signatures).toHaveLength(2);
  await observe(app, pixelUrl);
  expect(
    await (
      await app(httpRequest(auth, { body: JSON.stringify(auth, null, 2) }))
    ).json(),
  ).toEqual(result);
  for (const change of [
    (a: AuthorizationRequest) => {
      a.outputs[0]!.amount++;
    },
    (a: AuthorizationRequest) => {
      a.outputs.reverse();
    },
    (a: AuthorizationRequest) => {
      a.outputs[0]!.B_ = a.outputs[1]!.B_;
    },
    (a: AuthorizationRequest) => {
      a.outputs[0]!.B_ = a.outputs[0]!.B_.toUpperCase().replace(
        /^0[23]/,
        a.outputs[0]!.B_.slice(0, 2),
      );
    },
  ]) {
    const changed = structuredClone(auth);
    change(changed);
    await expectError(
      await app(httpRequest(changed)),
      "authorization_conflict",
      409,
    );
  }
});

test("callbacks and exact signatures survive reopen, long delays, and refreshed NIP-98", async () => {
  const path = temporaryDatabase();
  const fixture = makeFixture();
  const first = openStore(path);
  await observe(
    createOracle(config, first, () => NOW),
    fixture.pixelUrl,
  );
  first.close();
  let now = NOW + 365 * 86400;
  const second = openStore(path);
  const afterRestart = createOracle(config, second, () => now);
  const response = await afterRestart(httpRequest(fixture.auth, { now }));
  expect(response.status).toBe(200);
  const result = await response.json();
  second.close();
  const third = setup(path, () => now);
  // Existing authorization does not depend on finding the callback again.
  const db = new Database(path);
  db.exec("DELETE FROM callbacks");
  db.close();
  now += 600;
  await expectError(
    await third.app(httpRequest(fixture.auth)),
    "unauthorized",
    401,
  );
  expect(
    await (await third.app(httpRequest(fixture.auth, { now }))).json(),
  ).toEqual(result);
  const other = makeFixture({
    request: fixture.auth.request,
    nonce: "11".repeat(16),
  });
  await observe(third.app, other.pixelUrl);
  await expectError(
    await third.app(httpRequest(other.auth, { now })),
    "authorization_conflict",
    409,
  );
});

test("competing bids and output sets cannot both authorize through separate connections", async () => {
  const path = temporaryDatabase();
  const one = setup(path);
  const two = setup(path);
  const a = makeFixture();
  const b = makeFixture({ request: a.auth.request, nonce: "22".repeat(16) });
  await observe(one.app, a.pixelUrl);
  await observe(two.app, b.pixelUrl);
  const responses = await Promise.all([
    one.app(httpRequest(a.auth)),
    two.app(httpRequest(b.auth)),
  ]);
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  await expectError(
    responses.find((r) => r.status === 409)!,
    "authorization_conflict",
    409,
  );
  const alternate = structuredClone(a.auth);
  alternate.outputs.reverse();
  const outputs = await Promise.all([
    one.app(httpRequest(a.auth)),
    two.app(httpRequest(alternate)),
  ]);
  expect(outputs.map((r) => r.status).sort()).toEqual([200, 409]);
});

test("failed persistence releases no signature and leaves the opportunity available", async () => {
  const path = temporaryDatabase();
  const { app } = setup(path);
  const { auth, pixelUrl } = makeFixture();
  await observe(app, pixelUrl);
  const db = new Database(path);
  try {
    db.exec(
      "CREATE TRIGGER fail_authorization BEFORE INSERT ON authorizations BEGIN SELECT RAISE(ABORT, 'test failure'); END;",
    );
    await expectError(await app(httpRequest(auth)), "internal_error", 500);
    expect(
      db.query("SELECT count(*) AS count FROM authorizations").get(),
    ).toEqual({ count: 0 });
    db.exec("DROP TRIGGER fail_authorization");
    expect((await app(httpRequest(auth))).status).toBe(200);
  } finally {
    db.close();
  }
});

describe("NIP-98 and original request authentication", () => {
  test("inclusive freshness boundary and reusable authentication", async () => {
    const { app } = setup();
    const { auth, pixelUrl } = makeFixture();
    await observe(app, pixelUrl);
    for (const delta of [-60, 60])
      expect((await app(httpRequest(auth, { now: NOW + delta }))).status).toBe(
        200,
      );
    for (const delta of [-61, 61])
      await expectError(
        await app(httpRequest(auth, { now: NOW + delta })),
        "unauthorized",
        401,
      );
  });
  test("rejects missing auth, wrong publisher, body, tags, signatures, kind and content", async () => {
    const { app } = setup();
    const { auth, pixelUrl } = makeFixture();
    await observe(app, pixelUrl);
    const missing = httpRequest(auth);
    missing.headers.delete("authorization");
    await expectError(await app(missing), "unauthorized", 401);
    await expectError(
      await app(httpRequest(auth, { signer: keys.stranger })),
      "publisher_mismatch",
      403,
    );
    const original = httpRequest(auth);
    const changed = new Request(original.url, {
      method: "POST",
      headers: original.headers,
      body: JSON.stringify(auth) + " ",
    });
    await expectError(await app(changed), "unauthorized", 401);
    for (const editEvent of [
      (e: Parameters<typeof signEvent>[0]) => {
        e.tags[0]![1] += "?changed=1";
      },
      (e: Parameters<typeof signEvent>[0]) => {
        e.tags[1]![1] = "GET";
      },
      (e: Parameters<typeof signEvent>[0]) => {
        e.tags.pop();
      },
      (e: Parameters<typeof signEvent>[0]) => {
        e.tags.push([...e.tags[0]!]);
      },
      (e: Parameters<typeof signEvent>[0]) => {
        e.tags[0]!.push("extra");
      },
      (e: Parameters<typeof signEvent>[0]) => {
        e.kind = 1;
      },
      (e: Parameters<typeof signEvent>[0]) => {
        e.content = "not empty";
      },
    ])
      await expectError(
        await app(httpRequest(auth, { editEvent })),
        "unauthorized",
        401,
      );
    const badHeader = httpRequest(auth);
    const event = JSON.parse(
      Buffer.from(
        badHeader.headers.get("authorization")!.slice(6),
        "base64",
      ).toString(),
    );
    event.sig = "00".repeat(64);
    badHeader.headers.set(
      "authorization",
      "Nostr " + Buffer.from(JSON.stringify(event)).toString("base64"),
    );
    await expectError(await app(badHeader), "unauthorized", 401);
    const invalid = structuredClone(auth);
    invalid.request.content += " ";
    await expectError(await app(httpRequest(invalid)), "invalid_bid_request");
    invalid.request = { ...auth.request, sig: "00".repeat(64) };
    await expectError(await app(httpRequest(invalid)), "invalid_bid_request");
    expect((await app(httpRequest(auth))).status).toBe(200);
  });
});

describe("local commitment and payment conditions", () => {
  const mutations: [string, (a: AuthorizationRequest) => void, string][] = [
    [
      "HTML",
      (a) => {
        a.creative.content += " ";
      },
      "commitment_mismatch",
    ],
    [
      "payment string",
      (a) => {
        a.payment += "=";
      },
      "commitment_mismatch",
    ],
    [
      "bidder",
      (a) => {
        a.commitment.bidder_pubkey = "ab".repeat(32);
      },
      "invalid_commitment",
    ],
    [
      "commitment signature",
      (a) => {
        a.commitment.sig = "00".repeat(64);
      },
      "invalid_commitment",
    ],
    [
      "nonce",
      (a) => {
        a.bid_nonce = "ff".repeat(16);
      },
      "invalid_commitment",
    ],
    [
      "size",
      (a) => {
        a.creative.width++;
      },
      "creative_size_mismatch",
    ],
    [
      "mint",
      (a) => {
        const t = tokenOf(a);
        t.m = "https://other.example";
        setToken(a, t);
      },
      "mint_not_accepted",
    ],
    [
      "unit",
      (a) => {
        const t = tokenOf(a);
        t.u = "usd";
        setToken(a, t);
      },
      "invalid_payment",
    ],
    [
      "witness",
      (a) => {
        const t = tokenOf(a);
        t.t[0]!.p[0]!.w = "{}";
        setToken(a, t);
      },
      "invalid_payment",
    ],
    [
      "duplicate inputs",
      (a) => {
        const t = tokenOf(a);
        t.t[1]!.p.push(t.t[0]!.p[0]!);
        setToken(a, t);
      },
      "duplicate_inputs",
    ],
    [
      "mixed tags",
      (a) => {
        changeSecrets(a, (s, i) => {
          if (i) s[1].tags.reverse();
        });
      },
      "mixed_payment_conditions",
    ],
    [
      "missing refund",
      (a) => {
        changeSecrets(a, (s) => {
          s[1].tags = s[1].tags.filter((t) => t[0] !== "refund");
        });
      },
      "invalid_payment_conditions",
    ],
    [
      "multiple refund keys",
      (a) => {
        changeSecrets(a, (s) => {
          s[1].tags
            .find((t) => t[0] === "refund")!
            .push(compressed(keys.stranger));
        });
      },
      "invalid_payment_conditions",
    ],
    [
      "duplicate tags",
      (a) => {
        changeSecrets(a, (s) => {
          s[1].tags.push(["sigflag", "SIG_ALL"]);
        });
      },
      "invalid_payment_conditions",
    ],
    [
      "SIG_INPUTS",
      (a) => {
        changeSecrets(a, (s) => {
          s[1].tags.find((t) => t[0] === "sigflag")![1] = "SIG_INPUTS";
        });
      },
      "invalid_payment_conditions",
    ],
    [
      "threshold",
      (a) => {
        changeSecrets(a, (s) => {
          s[1].tags.find((t) => t[0] === "n_sigs")![1] = "1";
        });
      },
      "invalid_payment_conditions",
    ],
    [
      "missing locktime",
      (a) => {
        changeSecrets(a, (s) => {
          s[1].tags = s[1].tags.filter((t) => t[0] !== "locktime");
        });
      },
      "invalid_payment_conditions",
    ],
    [
      "duplicate payment keys",
      (a) => {
        changeSecrets(a, (s) => {
          s[1].tags.find((t) => t[0] === "pubkeys")![1] = s[1].data;
        });
      },
      "invalid_payment_conditions",
    ],
    [
      "identity-key commitment",
      (a) => {
        sealCommitment(a, keys.bidder);
      },
      "invalid_commitment",
    ],
  ];
  test.each(mutations)(
    "rejects changed %s without reserving the opportunity",
    async (_, mutate, code) => {
      const { app } = setup();
      const { auth, pixelUrl } = makeFixture();
      await observe(app, pixelUrl);
      const modified = structuredClone(auth);
      mutate(modified);
      await expectError(await app(httpRequest(modified)), code);
      expect((await app(httpRequest(auth))).status).toBe(200);
    },
  );
  test("accepts unbalanced, duplicate and invalid-curve outputs: their validity belongs to publisher", async () => {
    const { app } = setup();
    const { auth, pixelUrl } = makeFixture();
    await observe(app, pixelUrl);
    auth.outputs = [
      { amount: 0, B_: "02" + "ff".repeat(32) },
      { amount: 5000, B_: "02" + "ff".repeat(32) },
    ];
    const result = await app(httpRequest(auth));
    expect(result.status).toBe(200);
    expect(
      independentlyVerifySpend(
        auth,
        ((await result.json()) as { signature: string }).signature,
      ).valid,
    ).toBe(true);
  });
  test("supports padded original tokens, metadata, short IDs, and original secret whitespace", async () => {
    const { app } = setup();
    const fixture = makeFixture();
    const token = tokenOf(fixture.auth);
    token.d = "Original memo";
    token.t[1]!.i = token.t[1]!.i.slice(0, 8);
    for (const group of token.t)
      for (const proof of group.p)
        proof.s = JSON.stringify(JSON.parse(proof.s), null, 2);
    setToken(fixture.auth, token);
    fixture.auth.payment += "=".repeat(
      (4 - (fixture.auth.payment.slice(6).length % 4)) % 4,
    );
    sealCommitment(fixture.auth);
    await observe(app, fixture.pixelUrl);
    const response = await app(httpRequest(fixture.auth));
    expect(response.status).toBe(200);
    expect(
      independentlyVerifySpend(
        fixture.auth,
        ((await response.json()) as { signature: string }).signature,
      ).valid,
    ).toBe(true);
  });
});

test("pixel recognition requires an image src, handles HTML entities, and matches the exact bid", async () => {
  for (const html of [
    (p: string) => `<!-- <img src="${p}"> -->`,
    (p: string) => `<script>const pixel = '<img src="${p}">'</script>`,
    (p: string) => `<template><img src="${p}"></template>`,
    (p: string) => `<img src="${p}?other=1">`,
  ]) {
    const { app } = setup();
    const { auth, pixelUrl } = makeFixture({ html });
    await observe(app, pixelUrl);
    await expectError(await app(httpRequest(auth)), "pixel_url_mismatch");
  }
  const { app } = setup();
  const { auth, pixelUrl } = makeFixture({
    html: (p) => `<IMG SRC="${p.replaceAll("/", "&#47;")}">`,
  });
  await observe(app, pixelUrl.replace(/.$/, "0"));
  await expectError(await app(httpRequest(auth)), "pixel_not_observed", 409);
  await observe(app, pixelUrl);
  expect((await app(httpRequest(auth))).status).toBe(200);
});

test("rejects malformed/ambiguous JSON, unsupported fields and unsafe output amounts", async () => {
  const { app } = setup();
  const { auth, pixelUrl } = makeFixture();
  await observe(app, pixelUrl);
  for (const body of [
    "{",
    JSON.stringify(auth).replace(
      '"bid_nonce":',
      '"bid_nonce":"' + "aa".repeat(16) + '","bid_nonce":',
    ),
    JSON.stringify(auth).replace("Example ☃", "Example \\ud800"),
  ]) {
    await expectError(await app(httpRequest(auth, { body })), "invalid_json");
  }
  for (const modified of [
    { ...auth, amount_sat: 8 },
    { ...auth, bid_nonce: "invalid" },
    {
      ...auth,
      outputs: [{ amount: 9007199254740992, B_: auth.outputs[0]!.B_ }],
    },
  ])
    await expectError(
      await app(httpRequest(auth, { body: JSON.stringify(modified) })),
      "invalid_request",
    );
  const invalid = httpRequest(auth);
  invalid.headers.set("content-type", "text/plain");
  await expectError(await app(invalid), "unsupported_media_type", 415);
  const huge = httpRequest(auth, { body: " ".repeat(MAX_BODY_BYTES + 1) });
  await expectError(await app(huge), "payload_too_large", 413);
});

test("checks oracle configuration and rejects prohibited public context", async () => {
  const changes: ((t: BidRequest) => void)[] = [
    (t) => {
      t.oracle.pubkey = "aa".repeat(32);
    },
    (t) => {
      t.oracle.payment_pubkey = compressed(keys.stranger);
    },
    (t) => {
      t.oracle.pixel_base = "https://other.example/pixel";
    },
  ];
  for (const terms of changes) {
    const fixture = makeFixture({ terms });
    const { app } = setup();
    await expectError(await app(httpRequest(fixture.auth)), "oracle_mismatch");
  }
  const fixture = makeFixture({
    terms: (t) => {
      t.device = { ext: { ip: "192.0.2.1" } };
    },
  });
  const { app } = setup();
  await expectError(await app(httpRequest(fixture.auth)), "invalid_request");
});

test("rejects malformed CBOR text, duplicate keys, and trailing bytes", async () => {
  const { app } = setup();
  const { auth, pixelUrl } = makeFixture();
  await observe(app, pixelUrl);
  const original = Buffer.from(auth.payment.slice(6), "base64url");
  const badText = Buffer.from(original);
  badText[badText.indexOf("first-")] = 255;
  const duplicate = Buffer.concat([
    original,
    Buffer.from([0x61, 0x75, 0x63, 0x73, 0x61, 0x74]),
  ]);
  expect(duplicate[0]).toBe(0xa3);
  duplicate[0] = 0xa4;
  for (const bytes of [
    badText,
    duplicate,
    Buffer.concat([original, Buffer.from([0])]),
  ]) {
    const modified = structuredClone(auth);
    modified.payment = "cashuB" + bytes.toString("base64url");
    sealCommitment(modified);
    await expectError(await app(httpRequest(modified)), "invalid_payment");
  }
  expect((await app(httpRequest(auth))).status).toBe(200);
});

test("accepts default refund threshold, zero locktime, and large CBOR input amounts", async () => {
  const { app } = setup();
  const { auth, pixelUrl } = makeFixture();
  changeSecrets(auth, (secret) => {
    secret[1].tags = secret[1].tags.filter((tag) => tag[0] !== "n_sigs_refund");
    secret[1].tags.find((t) => t[0] === "locktime")![1] = "0";
  });
  const token = tokenOf(auth);
  token.t[0]!.p[0]!.a = 2n ** 63n;
  Object.assign(token, {
    x: "Unknown Cashu field preserved in the commitment",
  });
  setToken(auth, token);
  await observe(app, pixelUrl);
  const response = await app(httpRequest(auth));
  expect(response.status).toBe(200);
  expect(
    independentlyVerifySpend(
      auth,
      ((await response.json()) as { signature: string }).signature,
    ).valid,
  ).toBe(true);
});
