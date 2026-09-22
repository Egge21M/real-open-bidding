import { z } from "zod";
import type { PublisherConfig } from "./config";
import type { PublisherStore } from "./store";
import type { RelayTransport } from "./relay";
import { loadSchema } from "./schemas";
import {
  deriveAuctionKey,
  hex,
  publicKey,
  randomHex,
  signEvent,
} from "./crypto";
import { createPlan, validateBid, type VerifiedBid } from "./bids";
import { PublisherError, requireCondition } from "./errors";
import { decodeUtf8, parseJson } from "./json";
import { creativeHeaders } from "./creative";

export const MAX_BODY_BYTES = 32 * 1024;
async function body(request: Request): Promise<unknown> {
  requireCondition(
    /^application\/json(?:;|$)/i.test(
      request.headers.get("content-type") ?? "",
    ),
    "unsupported_media_type",
    415,
  );
  requireCondition(
    Number(request.headers.get("content-length") ?? 0) <= MAX_BODY_BYTES,
    "payload_too_large",
    413,
  );
  const reader = request.body?.getReader();
  requireCondition(reader, "invalid_body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new PublisherError(413, "payload_too_large");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  return parseJson(decodeUtf8(Buffer.concat(chunks)));
}

export function createPublisher(
  config: PublisherConfig,
  store: PublisherStore,
  relay: RelayTransport,
  options: {
    clock?: () => number;
    wait?: (ms: number) => Promise<void>;
  } = {},
) {
  const clock = options.clock ?? Date.now;
  const wait =
    options.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let active = 0;
  return async (request: Request): Promise<Response> => {
    const headers = new Headers({
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    try {
      const url = new URL(request.url);
      requireCondition(!url.search, "not_found", 404);
      if (url.pathname === "/health" && request.method === "GET")
        return Response.json({ status: "ok" }, { headers });
      const creative = url.pathname.match(/^\/v1\/creatives\/([a-f0-9]{64})$/);
      if (creative) {
        requireCondition(request.method === "GET", "method_not_allowed", 405);
        const auction = store.creative(creative[1]!);
        requireCondition(auction?.selected, "not_found", 404);
        return new Response(auction.selected.bid.creative.content, {
          headers: creativeHeaders(auction.origin),
        });
      }
      requireCondition(url.pathname === "/v1/auctions", "not_found", 404);
      const origin = request.headers.get("origin");
      requireCondition(
        origin && config.allowedOrigins.includes(origin),
        "origin_not_allowed",
        403,
      );
      headers.set("access-control-allow-origin", origin);
      headers.set("vary", "Origin");
      if (request.method === "OPTIONS") {
        headers.set("access-control-allow-methods", "POST");
        headers.set("access-control-allow-headers", "content-type");
        return new Response(null, { status: 204, headers });
      }
      requireCondition(request.method === "POST", "method_not_allowed", 405);
      requireCondition(
        active < config.maxConcurrentAuctions,
        "publisher_busy",
        503,
      );
      const load = loadSchema.parse(await body(request));
      // Another request may have reserved the last slot while this body streamed.
      requireCondition(
        active < config.maxConcurrentAuctions,
        "publisher_busy",
        503,
      );
      const site = { ...load.context?.site, domain: new URL(origin).hostname };
      if (site.page) {
        const page = new URL(site.page);
        requireCondition(
          page.origin === origin &&
            !page.username &&
            !page.password &&
            !page.search &&
            !page.hash,
          "invalid_page_context",
        );
      }
      const key = deriveAuctionKey(config.paymentSeed);
      const closesAt = Math.ceil(clock() / 1000) + config.auctionSeconds;
      const terms = {
        version: 1,
        impression_id: randomHex().slice(0, 32),
        banner_sizes: load.sizes,
        site,
        ...(load.context?.device ? { device: load.context.device } : {}),
        closes_at: closesAt,
        mints: config.mints.map((m) => m.url),
        publisher_payment_pubkey: publicKey(key),
        oracle: {
          pubkey: config.oracle.pubkey,
          payment_pubkey: config.oracle.payment_pubkey,
          pixel_base: config.oracle.pixel_base,
        },
      };
      const event = signEvent(
        {
          kind: 28300,
          created_at: Math.floor(clock() / 1000),
          tags: [],
          content: JSON.stringify(terms),
        },
        config.identityKey,
      );
      store.create({
        bidRequestId: event.id,
        request: event,
        paymentKey: hex(key),
        origin,
        placement: load.placement,
        closesAt,
        state: "collecting",
      });
      active++;
      let close: (() => void) | undefined;
      let collecting = true;
      let count = 0;
      const candidates: VerifiedBid[] = [];
      try {
        close = await relay.publish(event, (delivery) => {
          if (
            !collecting ||
            delivery.receivedAt >= closesAt * 1000 ||
            clock() >= closesAt * 1000 ||
            count++ >= config.maxBidsPerAuction
          )
            return;
          try {
            const candidate = validateBid(
              delivery.content,
              delivery.sender,
              event,
              config,
              Math.floor(clock() / 1000),
            );
            if (clock() >= closesAt * 1000 || !store.claim(candidate)) return;
            candidates.push(candidate);
          } catch {
            /* Ineligible offers do not fail the publisher's auction. */
          }
        });
        await wait(Math.max(0, closesAt * 1000 - clock()));
        collecting = false;
        // Leave one scheduling interval plus an oracle request and mint swap.
        // This is an acceptance margin, not a guarantee against later refunds.
        const settlementBudget =
          config.workerIntervalMs + 2 * config.networkTimeoutMs;
        const settleBefore = clock() + settlementBudget;
        const winner = candidates
          .filter((bid) => bid.refundAt * 1000 > settleBefore)
          .sort((a, b) => b.net - a.net)[0];
        if (!winner) {
          store.finish(event.id);
          return Response.json(
            { status: "no_fill", bid_request_id: event.id },
            { headers },
          );
        }
        const token = randomHex();
        store.finish(event.id, {
          bid: winner,
          plan: createPlan(winner),
          token,
        });
        return Response.json(
          {
            status: "filled",
            bid_request_id: event.id,
            creative_url: `${config.publicUrl}/v1/creatives/${token}`,
            width: winner.bid.creative.width,
            height: winner.bid.creative.height,
          },
          { headers },
        );
      } catch (error) {
        store.fail(event.id, "auction_failed");
        if (error instanceof PublisherError) throw error;
        throw new PublisherError(503, "auction_failed");
      } finally {
        collecting = false;
        close?.();
        active--;
      }
    } catch (error) {
      const status =
        error instanceof PublisherError
          ? error.status
          : error instanceof z.ZodError
            ? 400
            : 500;
      return Response.json(
        {
          error:
            error instanceof PublisherError
              ? error.code
              : status === 400
                ? "invalid_request"
                : "internal_error",
        },
        { status, headers },
      );
    }
  };
}
