import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPublisher } from "../src/app";
import { openStore } from "../src/store";
import { createSettlementWorker } from "../src/settlement";
import { validateBid } from "../src/bids";
import {
  config,
  fundedBid,
  bidderIdentity,
  loadRequest,
  oracleKey,
  mintPromise,
  keysetId,
  mintSecrets,
} from "./fixtures";
import {
  hashToCurve,
  publicKey,
  swapDigest,
  verifySignature,
  hashHex,
} from "../src/crypto";
import { decodePayment } from "../src/payment";
import type { Bid, SignedEvent } from "../src/schemas";
// Independent oracle implementation is a controlled counterpart for this proof.
import { createOracle } from "../../oracle/src/app";
import { openStore as openOracleStore } from "../../oracle/src/store";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0).reverse()) close();
});

function harness(offers?: (request: SignedEvent) => Bid[], path = ":memory:") {
  let now = 1800000000000;
  const cfg = config();
  let event!: SignedEvent;
  const store = openStore(path);
  let closed = false;
  const close = () => {
    if (!closed) {
      store.close();
      closed = true;
    }
  };
  cleanup.push(close);
  const app = createPublisher(
    cfg,
    store,
    {
      async publish(request, receive) {
        event = request;
        for (const bid of offers?.(request) ?? [])
          receive({ sender: bidderIdentity, content: bid, receivedAt: now });
        return () => {};
      },
      close() {},
    },
    {
      clock: () => now,
      wait: async (ms) => {
        now += ms;
      },
    },
  );
  return {
    cfg,
    store,
    app,
    close,
    event: () => event,
    clock: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("publisher auction", () => {
  test("selects highest positive net bid, preserves HTML and fixes selection", async () => {
    const h = harness((request) => [
      fundedBid(request, { amount: 4 }),
      fundedBid(request, { amount: 16 }),
      fundedBid(request, { amount: 8 }),
    ]);
    const response = await h.app(loadRequest());
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.status).toBe("filled");
    const auction = h.store.get(result.bid_request_id)!;
    expect(auction.selected?.net).toBe(15);
    expect(auction.plan?.outputs.reduce((n, p) => n + p.amount, 0)).toBe(15);
    const creative = await h.app(new Request(result.creative_url));
    expect(await creative.text()).toBe(auction.selected!.bid.creative.content);
    expect(creative.headers.get("content-security-policy")).toContain(
      "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox",
    );
    expect(creative.headers.get("content-security-policy")).not.toContain(
      "allow-same-origin",
    );
    expect(() => h.store.finish(auction.bidRequestId)).toThrow(
      "auction_already_finished",
    );
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://site.example",
    );
  });
  test("ties use first valid receipt; retransmissions do not add competing bids", async () => {
    let first!: Bid;
    const h = harness((request) => {
      first = fundedBid(request);
      return [first, first, fundedBid(request)];
    });
    const result = await (await h.app(loadRequest())).json();
    expect(h.store.get(result.bid_request_id)?.selected?.bid.bid_nonce).toBe(
      first.bid_nonce,
    );
  });
  test("no bids and fee-only bids produce no-fill; no wallet proceeds appear", async () => {
    for (const offers of [
      () => [],
      (event: SignedEvent) => [fundedBid(event, { amount: 1 })],
    ]) {
      const h = harness(offers);
      const result = await (await h.app(loadRequest())).json();
      expect(result.status).toBe("no_fill");
      expect(h.store.balance()).toEqual([]);
    }
  });
  test("keys are unique per auction and public context is domain-only by default", async () => {
    const h = harness();
    await h.app(loadRequest());
    const first = JSON.parse(h.event().content);
    await h.app(loadRequest());
    const second = JSON.parse(h.event().content);
    expect(first.publisher_payment_pubkey).not.toBe(
      second.publisher_payment_pubkey,
    );
    expect(first.site).toEqual({ domain: "site.example" });
    expect(first.device).toBeUndefined();
  });
  test("rejects unconfigured origins, forbidden context, query-bearing page URLs and invalid sizes", async () => {
    const h = harness();
    expect((await h.app(loadRequest("https://other.example"))).status).toBe(
      403,
    );
    for (const extra of [
      { context: { device: { ip: "127.0.0.1" } } },
      { context: { site: { page: "https://site.example/?private=1" } } },
      { sizes: [{ width: 0, height: 250 }] },
    ])
      expect(
        (
          await h.app(
            loadRequest(undefined, {
              placement: "sidebar",
              sizes: [{ width: 300, height: 250 }],
              ...extra,
            }),
          )
        ).status,
      ).toBe(400);
  });
  test("tampered commitments, wrong sizes and expired funding never win", async () => {
    const h = harness((request) => {
      const forged = fundedBid(request);
      forged.creative.content += " ";
      return [
        forged,
        fundedBid(request, { width: 728 }),
        fundedBid(request, { refundAt: 1800000000 }),
      ];
    });
    expect((await (await h.app(loadRequest())).json()).status).toBe("no_fill");
  });
  test("missing/invalid DLEQ fails local acceptance without a mint call", async () => {
    const h = harness();
    await h.app(loadRequest());
    const good = fundedBid(h.event());
    expect(
      validateBid(good, bidderIdentity, h.event(), h.cfg, 1800000000).net,
    ).toBe(7);
    const token = decodePayment(good.payment);
    token.t[0]!.p[0]!.d!.s.fill(0);
    const { encode } = await import("cborg");
    const { commitmentDigest, signDigest } = await import("../src/crypto");
    const { refundKey } = await import("./fixtures");
    good.payment = "cashuB" + Buffer.from(encode(token)).toString("base64url");
    good.commitment.payment_hash = hashHex(good.payment);
    good.commitment.sig = signDigest(
      commitmentDigest(
        {
          request: h.event(),
          payment: good.payment,
          bid_nonce: good.bid_nonce,
          creative: good.creative,
          commitment: good.commitment,
          outputs: [],
        },
        good.impression_id,
      ),
      refundKey,
    );
    expect(() =>
      validateBid(good, bidderIdentity, h.event(), h.cfg, 1800000000),
    ).toThrow("invalid_dleq");
  });
});

test("oracle pixel retry, real authorization, lost swap response and restart recovery credit exactly once", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rob-publisher-"));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "publisher.sqlite");
  const h = harness((request) => [fundedBid(request)], path);
  const result = await (await h.app(loadRequest())).json();
  const auction = h.store.get(result.bid_request_id)!;
  const oracleStore = openOracleStore(":memory:");
  cleanup.push(() => oracleStore.close());
  const oracle = createOracle(
    {
      authorizationUrl: h.cfg.oracle.authorizationUrl,
      pixelBase: h.cfg.oracle.pixel_base,
      identity: h.cfg.oracle.pubkey,
      paymentPubkey: publicKey(oracleKey),
      privateKey: oracleKey,
      databasePath: ":memory:",
      hostname: "localhost",
      port: 0,
    },
    oracleStore,
    () => Math.floor(h.clock() / 1000),
  );
  let saved: any;
  let swaps = 0;
  const calls: string[] = [];
  const http = async (url: string, init?: RequestInit) => {
    calls.push(url);
    if (url.startsWith("https://oracle.example"))
      return oracle(new Request(url, init));
    const body = JSON.parse(String(init?.body));
    if (url.endsWith("/v1/restore")) {
      expect(body.outputs).toEqual(saved.outputs);
      return Response.json({
        outputs: saved.outputs,
        signatures: saved.signatures,
      });
    }
    expect(url).toBe("https://mint.example/v1/swap");
    swaps++;
    expect(body.inputs[0].dleq).toBeUndefined();
    const digest = swapDigest(body.inputs, body.outputs);
    const signatures = JSON.parse(body.inputs[0].witness).signatures;
    expect(
      verifySignature(signatures[0], digest, publicKey(oracleKey).slice(2)),
    ).toBe(true);
    const terms = JSON.parse(auction.request.content);
    expect(
      verifySignature(
        signatures[1],
        digest,
        terms.publisher_payment_pubkey.slice(2),
      ),
    ).toBe(true);
    for (const input of body.inputs)
      expect(
        hashToCurve(input.secret)
          .multiply(mintSecrets[input.amount]!)
          .toHex(true),
      ).toBe(input.C);
    saved = {
      outputs: body.outputs,
      signatures: body.outputs.map((o: any) => mintPromise(o.B_, o.amount)),
    };
    throw new Error("response lost after mint committed");
  };
  const worker = createSettlementWorker(h.cfg, h.store, http, h.clock);
  await worker.runOnce();
  expect(h.store.get(auction.bidRequestId)?.lastError).toBe(
    "pixel_not_observed",
  );
  expect(swaps).toBe(0);
  const pixel = `${h.cfg.oracle.pixel_base}/${auction.bidRequestId}/${auction.selected!.bid.impression_id}/${auction.selected!.bid.bid_nonce}`;
  expect((await oracle(new Request(pixel))).status).toBe(200);
  h.advance(2000);
  await worker.runOnce();
  expect(h.store.get(auction.bidRequestId)?.phase).toBe("submitted");
  expect(swaps).toBe(1);
  const originalPlan = h.store.get(auction.bidRequestId)!.plan;
  h.close();
  const reopen = openStore(path);
  cleanup.push(() => reopen.close());
  h.advance(60000);
  const resumed = createSettlementWorker(h.cfg, reopen, http, h.clock);
  await resumed.runOnce();
  await resumed.runOnce();
  expect(reopen.get(auction.bidRequestId)?.phase).toBe("settled");
  expect(reopen.get(auction.bidRequestId)?.plan).toEqual(originalPlan);
  expect(reopen.balance()).toEqual([
    { mint: "https://mint.example", amount: 7 },
  ]);
  expect(swaps).toBe(1);
  expect(calls.some((url) => url.includes("checkstate"))).toBe(false);
});

test("local receipts reject conflicting nonces and funding reused by independent bids", async () => {
  const h = harness();
  await h.app(loadRequest());
  const bid = fundedBid(h.event());
  const validated = validateBid(
    bid,
    bidderIdentity,
    h.event(),
    h.cfg,
    1800000000,
  );
  expect(h.store.claim(validated)).toBe(true);
  expect(h.store.claim(validated)).toBe(false);
  expect(() =>
    h.store.claim({ ...validated, bid: { ...bid, amount_sat: 16 } }),
  ).toThrow("bid_nonce_conflict");
  expect(() =>
    h.store.claim({
      ...validated,
      bid: { ...bid, bid_nonce: "aa".repeat(16) },
    }),
  ).toThrow("proof_reuse");
});

test("fresh auction keys reject prior funding; wrong senders and expired keysets fail", async () => {
  const h = harness();
  await h.app(loadRequest());
  const original = h.event(),
    bid = fundedBid(original);
  expect(() =>
    validateBid(bid, "ff".repeat(32), original, h.cfg, 1800000000),
  ).toThrow("bidder_mismatch");
  await h.app(loadRequest());
  const next = h.event();
  // Directly changing bid references cannot change the proof's publisher lock.
  const rebased = {
    ...bid,
    bid_request_id: next.id,
    impression_id: JSON.parse(next.content).impression_id,
  };
  expect(() =>
    validateBid(rebased, bidderIdentity, next, h.cfg, 1800000000),
  ).toThrow("invalid_payment_conditions");
  const expired = {
    ...h.cfg,
    mints: h.cfg.mints.map((m) => ({
      ...m,
      keysets: m.keysets.map((k) => ({ ...k, final_expiry: 1799999999 })),
    })),
  };
  expect(() =>
    validateBid(bid, bidderIdentity, original, expired, 1800000000),
  ).toThrow("expired_keyset");
});

test("bids received at closes_at and funding expiring by selection cannot win", async () => {
  const store = openStore(":memory:");
  cleanup.push(() => store.close());
  let now = 1800000000000;
  const app = createPublisher(
    config(),
    store,
    {
      async publish(event, receive) {
        const closes = JSON.parse(event.content).closes_at;
        receive({
          sender: bidderIdentity,
          content: fundedBid(event, { amount: 16 }),
          receivedAt: closes * 1000,
        });
        receive({
          sender: bidderIdentity,
          content: fundedBid(event, { refundAt: closes }),
          receivedAt: now,
        });
        return () => {};
      },
      close() {},
    },
    {
      clock: () => now,
      wait: async (ms) => {
        now += ms;
      },
    },
  );
  expect((await (await app(loadRequest())).json()).status).toBe("no_fill");
});

test("invalid oracle signatures never reach mint; unresolved spends survive refund eligibility", async () => {
  const h = harness((event) => [fundedBid(event)]);
  const result = await (await h.app(loadRequest())).json();
  const id = result.bid_request_id;
  const calls: string[] = [];
  const worker = createSettlementWorker(
    h.cfg,
    h.store,
    async (url) => {
      calls.push(url);
      return Response.json({ signature: "00".repeat(64) });
    },
    h.clock,
  );
  await worker.runOnce();
  expect(calls).toEqual([h.cfg.oracle.authorizationUrl]);
  expect(h.store.get(id)?.lastError).toBe("invalid_oracle_signature");
  // Model the durable state after the mint may have accepted a swap.
  h.store.update(id, { phase: "submitted", oracleSignature: "11".repeat(64) });
  h.advance(300000);
  const reconcile = createSettlementWorker(
    h.cfg,
    h.store,
    async (url) => {
      expect(url).toBe("https://mint.example/v1/restore");
      return Response.json({ outputs: [], signatures: [] });
    },
    h.clock,
  );
  await reconcile.runOnce();
  expect(h.store.get(id)?.phase).toBe("submitted");
  expect(h.store.get(id)?.lastError).toBe("unresolved_after_refund_deadline");
  expect(h.store.balance()).toEqual([]);
});
