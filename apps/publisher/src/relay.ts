import { nip44 } from "nostr-tools";
import { schnorr } from "@noble/curves/secp256k1.js";
import { z } from "zod";
import { eventDigest, hex, verifyEvent } from "./crypto";
import { eventSchema, type SignedEvent } from "./schemas";
import { parseJson } from "./json";
import { requireCondition } from "./errors";

export interface BidDelivery {
  sender: string;
  content: unknown;
  receivedAt: number;
}
export interface RelayTransport {
  publish(
    request: SignedEvent,
    receive: (bid: BidDelivery) => void,
  ): Promise<() => void>;
  close(): void;
}

export function unwrapBid(value: unknown, privateKey: Uint8Array): BidDelivery {
  const recipient = hex(schnorr.getPublicKey(privateKey));
  const outer = eventSchema.parse(value);
  requireCondition(outer.kind === 21059 && verifyEvent(outer), "invalid_wrap");
  const recipients = outer.tags.filter((t) => t[0] === "p");
  requireCondition(
    recipients.length === 1 && recipients[0]![1] === recipient,
    "wrong_recipient",
  );
  const seal = eventSchema.parse(
    parseJson(
      nip44.decrypt(
        outer.content,
        nip44.getConversationKey(privateKey, outer.pubkey),
      ),
    ),
  );
  requireCondition(
    seal.kind === 13 && seal.tags.length === 0 && verifyEvent(seal),
    "invalid_seal",
  );
  const rumor = eventSchema
    .omit({ sig: true })
    .strict()
    .parse(
      parseJson(
        nip44.decrypt(
          seal.content,
          nip44.getConversationKey(privateKey, seal.pubkey),
        ),
      ),
    );
  requireCondition(
    rumor.kind === 28301 &&
      rumor.pubkey === seal.pubkey &&
      hex(eventDigest(rumor)) === rumor.id,
    "invalid_rumor",
  );
  const content = parseJson(rumor.content);
  const reference = z
    .object({ bid_request_id: z.string() })
    .parse(content).bid_request_id;
  // Local MVP wire profile: exactly one e-reference and p-recipient on the rumor.
  for (const [name, expected] of [
    ["e", reference],
    ["p", recipient],
  ]) {
    const tags = rumor.tags.filter((t) => t[0] === name);
    requireCondition(
      tags.length === 1 && tags[0]!.length === 2 && tags[0]![1] === expected,
      "invalid_bid_tags",
    );
  }
  return { sender: seal.pubkey, content, receivedAt: Date.now() };
}

/** A subscription is installed before publishing each request on each connection. */
export function createRelayTransport(
  urls: string[],
  privateKey: Uint8Array,
  timeoutMs: number,
): RelayTransport {
  const sockets = new Set<WebSocket>();
  const recipient = hex(schnorr.getPublicKey(privateKey));
  return {
    async publish(request, receive) {
      let live = true;
      const connections: WebSocket[] = [];
      const attempts = urls.map(
        (url) =>
          new Promise<void>((resolve, reject) => {
            const ws = new WebSocket(url);
            connections.push(ws);
            sockets.add(ws);
            const subscription = request.id.slice(0, 32);
            let acknowledged = false;
            const timer = setTimeout(() => {
              reject(new Error("relay_timeout"));
              ws.close();
            }, timeoutMs);
            ws.onopen = () => {
              ws.send(
                JSON.stringify([
                  "REQ",
                  subscription,
                  { kinds: [21059], "#p": [recipient] },
                ]),
              );
              ws.send(JSON.stringify(["EVENT", request]));
            };
            ws.onmessage = (event) => {
              if (
                !live ||
                typeof event.data !== "string" ||
                Buffer.byteLength(event.data) > 768 * 1024
              )
                return;
              const receivedAt = Date.now();
              try {
                const message = parseJson(event.data);
                if (!Array.isArray(message)) return;
                if (message[0] === "OK" && message[1] === request.id) {
                  clearTimeout(timer);
                  if (message[2] === true) {
                    acknowledged = true;
                    resolve();
                  } else {
                    reject(new Error("relay_rejected"));
                    ws.close();
                  }
                }
                if (message[0] === "EVENT" && message[1] === subscription) {
                  const bid = unwrapBid(message[2], privateKey);
                  const ref = (bid.content as Record<string, unknown>)
                    .bid_request_id;
                  if (ref === request.id) receive({ ...bid, receivedAt });
                }
              } catch {
                /* A hostile relay/bid must not terminate collection. */
              }
            };
            ws.onerror = () => {
              clearTimeout(timer);
              if (!acknowledged) reject(new Error("relay_unavailable"));
              ws.close();
            };
            ws.onclose = () => {
              sockets.delete(ws);
              clearTimeout(timer);
              if (!acknowledged) reject(new Error("relay_closed"));
            };
          }),
      );
      try {
        await Promise.any(attempts);
      } catch {
        live = false;
        connections.forEach((ws) => ws.close());
        throw new Error("relay_unavailable");
      }
      return () => {
        live = false;
        for (const ws of connections) {
          ws.close();
          sockets.delete(ws);
        }
      };
    },
    close() {
      for (const ws of sockets) ws.close();
      sockets.clear();
    },
  };
}
