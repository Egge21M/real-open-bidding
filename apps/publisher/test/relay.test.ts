import { expect, test } from "bun:test";
import { createRelayTransport, unwrapBid } from "../src/relay";
import { createPublisher } from "../src/app";
import { openStore } from "../src/store";
import { verifyEvent, hashHex } from "../src/crypto";
import {
  config,
  fundedBid,
  loadRequest,
  publisherKey,
  wrapBid,
} from "./fixtures";

test("real WebSocket relay carries signed request and authenticated encrypted bid", async () => {
  let requestVerified = false;
  let requestCount = 0;
  const server = Bun.serve<{ subscription?: string }>({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request, server) {
      if (server.upgrade(request, { data: {} })) return;
      return new Response(null, { status: 400 });
    },
    websocket: {
      message(ws, message) {
        const value = JSON.parse(String(message));
        if (value[0] === "REQ") {
          ws.data.subscription = value[1];
          return;
        }
        if (value[0] !== "EVENT") return;
        requestCount++;
        const request = value[1];
        requestVerified = verifyEvent(request);
        ws.send(JSON.stringify(["OK", request.id, true, ""]));
        const bid = fundedBid(request);
        const wrapped = wrapBid(bid, request.pubkey);
        // Incorrect outer signatures and recipient metadata must not reach the auction.
        ws.send(
          JSON.stringify([
            "EVENT",
            ws.data.subscription,
            { ...wrapped, id: hashHex("invalid") },
          ]),
        );
        ws.send(JSON.stringify(["EVENT", ws.data.subscription, wrapped]));
      },
    },
  });
  const store = openStore(":memory:");
  const cfg = config({
    relays: [`ws://127.0.0.1:${server.port}`],
    auctionSeconds: 2,
  });
  const relay = createRelayTransport(cfg.relays, publisherKey, 1000);
  try {
    const app = createPublisher(cfg, store, relay);
    const result = await (await app(loadRequest())).json();
    expect(result.status).toBe("filled");
    expect(requestVerified).toBe(true);
    expect(requestCount).toBe(1);
    expect(store.get(result.bid_request_id)?.selected?.net).toBe(7);
  } finally {
    relay.close();
    await server.stop(true);
    store.close();
  }
}, 10000);
