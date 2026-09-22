import { z } from "zod";
import type { PublisherConfig } from "./config";
import type { PublisherStore } from "./store";
import type { Auction } from "./db-schema";
import type { RecoveryOutput, Input } from "./bids";
import {
  hashHex,
  signEvent,
  signDigest,
  swapDigest,
  unhex,
  verifySignature,
  unblind,
  verifyDleq,
  publicKey,
} from "./crypto";
import { compressedKey, hex32, signature, bidRequestSchema } from "./schemas";
import { decodeUtf8, parseJson } from "./json";
import { PublisherError, requireCondition } from "./errors";

const promiseSchema = z.object({
  amount: z.int().positive(),
  id: z.string(),
  C_: compressedKey,
  dleq: z.object({ e: hex32, s: hex32 }).optional(),
});
const signaturesSchema = z.object({
  signatures: z.array(promiseSchema).max(128),
});
const restoredSchema = signaturesSchema.extend({
  outputs: z
    .array(
      z.object({
        amount: z.int().positive(),
        id: z.string(),
        B_: compressedKey,
      }),
    )
    .max(128),
});
export type HttpClient = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export async function jsonResponse(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  requireCondition(reader, "empty_remote_response", 502);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 2 * 1024 * 1024) {
        await reader.cancel();
        throw new PublisherError(502, "remote_response_too_large");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  return parseJson(decodeUtf8(Buffer.concat(chunks)));
}

function recoverProofs(
  outputs: RecoveryOutput[],
  promises: z.infer<typeof promiseSchema>[],
): Input[] {
  requireCondition(
    promises.length === outputs.length,
    "mint_signature_count",
    502,
  );
  return promises.map((promise, i) => {
    const output = outputs[i]!;
    requireCondition(
      promise.amount === output.amount && promise.id === output.id,
      "mint_signature_mismatch",
      502,
    );
    if (promise.dleq)
      requireCondition(
        verifyDleq(
          output.B_,
          promise.C_,
          output.mintKey,
          promise.dleq.e,
          promise.dleq.s,
        ),
        "invalid_mint_dleq",
        502,
      );
    return {
      amount: output.amount,
      id: output.id,
      secret: output.secret,
      C: unblind(promise.C_, output.mintKey, output.r),
    };
  });
}

export function createSettlementWorker(
  config: PublisherConfig,
  store: PublisherStore,
  http: HttpClient = fetch,
  clock = Date.now,
) {
  // Reserve independent capacity for new payments and ambiguous swap recovery.
  // A slow mint's restore calls must not prevent fresh oracle authorizations.
  const concurrency = 5;
  const active = new Map<string, { recovery: boolean; task: Promise<void> }>();
  let stopping = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  const post = (
    url: string,
    body: string,
    headers: Record<string, string> = {},
  ) =>
    http(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
      redirect: "error",
      signal: AbortSignal.timeout(config.networkTimeoutMs),
    });

  async function process(auction: Auction) {
    const selected = auction.selected!;
    const plan = auction.plan!;
    const terms = bidRequestSchema.parse(parseJson(auction.request.content));
    const outputs = plan.outputs.map(({ amount, id, B_ }) => ({
      amount,
      id,
      B_,
    }));
    let oracleSignature = auction.oracleSignature;
    if (!oracleSignature) {
      requireCondition(
        auction.request.pubkey === publicKey(config.identityKey).slice(2) &&
          terms.oracle.pubkey === config.oracle.pubkey &&
          terms.oracle.payment_pubkey === config.oracle.payment_pubkey &&
          terms.oracle.pixel_base === config.oracle.pixel_base,
        "recovery_configuration_mismatch",
        503,
      );
      if (selected.refundAt <= Math.floor(clock() / 1000)) {
        store.update(auction.bidRequestId, {
          phase: "failed",
          lastError: "refund_eligible",
        });
        return;
      }
      const body = JSON.stringify({
        request: auction.request,
        payment: selected.bid.payment,
        bid_nonce: selected.bid.bid_nonce,
        creative: {
          content: selected.bid.creative.content,
          width: selected.bid.creative.width,
          height: selected.bid.creative.height,
        },
        commitment: selected.bid.commitment,
        outputs: outputs.map(({ amount, B_ }) => ({ amount, B_ })),
      });
      const auth = signEvent(
        {
          kind: 27235,
          created_at: Math.floor(clock() / 1000),
          content: "",
          tags: [
            ["u", config.oracle.authorizationUrl],
            ["method", "POST"],
            ["payload", hashHex(body)],
          ],
        },
        config.identityKey,
      );
      const response = await post(config.oracle.authorizationUrl, body, {
        authorization:
          "Nostr " + Buffer.from(JSON.stringify(auth)).toString("base64"),
      });
      const value = await jsonResponse(response);
      if (!response.ok) {
        const code = z.object({ error: z.string() }).safeParse(value);
        const error = code.success ? code.data.error : "oracle_error";
        if (
          error === "pixel_not_observed" ||
          response.status >= 500 ||
          response.status === 429
        )
          throw new PublisherError(503, error);
        store.update(auction.bidRequestId, {
          phase: "failed",
          lastError: error,
        });
        return;
      }
      oracleSignature = z.object({ signature }).parse(value).signature;
      requireCondition(
        verifySignature(
          oracleSignature,
          swapDigest(plan.inputs, plan.outputs),
          terms.oracle.payment_pubkey.slice(2),
        ),
        "invalid_oracle_signature",
        502,
      );
      store.update(auction.bidRequestId, {
        phase: "authorized",
        oracleSignature,
        lastError: null,
      });
    }

    // Submitted is durable before the HTTP side effect. On an ambiguous result,
    // recover exactly those outputs via NUT-09 before attempting the same swap.
    if (auction.phase === "submitted") {
      const response = await post(
        selected.mint + "/v1/restore",
        JSON.stringify({ outputs }),
      );
      requireCondition(response.ok, "mint_restore_unavailable", 503);
      const restored = restoredSchema.parse(await jsonResponse(response));
      requireCondition(
        restored.outputs.length === restored.signatures.length,
        "invalid_restore",
        502,
      );
      if (restored.outputs.length) {
        requireCondition(
          restored.outputs.length === outputs.length,
          "partial_restore",
          502,
        );
        const pairs = new Map(
          restored.outputs.map((output, i) => [
            output.B_,
            { output, signature: restored.signatures[i]! },
          ]),
        );
        requireCondition(pairs.size === outputs.length, "invalid_restore", 502);
        const promises = outputs.map((output) => {
          const pair = pairs.get(output.B_);
          requireCondition(
            pair &&
              pair.output.id === output.id &&
              pair.output.amount === output.amount,
            "invalid_restore",
            502,
          );
          return pair.signature;
        });
        store.settle(
          auction.bidRequestId,
          recoverProofs(plan.outputs, promises),
        );
        return;
      }
      // A refund may have won. Keep reconciling the original outputs after expiry,
      // but do not initiate fresh spends with an expired funding assumption.
      if (selected.refundAt <= Math.floor(clock() / 1000))
        throw new PublisherError(503, "unresolved_after_refund_deadline");
    } else if (selected.refundAt <= Math.floor(clock() / 1000)) {
      store.update(auction.bidRequestId, {
        phase: "failed",
        lastError: "refund_eligible",
      });
      return;
    }
    const publisherSignature = signDigest(
      swapDigest(plan.inputs, plan.outputs),
      unhex(auction.paymentKey),
    );
    const inputs = plan.inputs.map((p, i) =>
      i === 0
        ? {
            ...p,
            witness: JSON.stringify({
              signatures: [oracleSignature, publisherSignature],
            }),
          }
        : p,
    );
    store.update(auction.bidRequestId, { phase: "submitted" });
    const response = await post(
      selected.mint + "/v1/swap",
      JSON.stringify({ inputs, outputs }),
    );
    requireCondition(response.ok, "mint_swap_unresolved", 503);
    const promises = signaturesSchema.parse(
      await jsonResponse(response),
    ).signatures;
    store.settle(auction.bidRequestId, recoverProofs(plan.outputs, promises));
  }

  async function attempt(auction: Auction) {
    try {
      await process(auction);
    } catch (error) {
      const code =
        error instanceof PublisherError ? error.code : "payment_retry_needed";
      const delay = Math.min(
        60000,
        config.workerIntervalMs * 2 ** Math.min(auction.attempts, 6),
      );
      store.update(auction.bidRequestId, {
        lastError: code,
        nextAttemptAt: clock() + delay,
      });
    }
  }
  return {
    async runOnce(): Promise<void> {
      if (stopping) return;
      for (const recovery of [false, true]) {
        const available =
          concurrency -
          Array.from(active.values()).filter((job) => job.recovery === recovery)
            .length;
        if (!available) continue;
        const due = store.pending(clock(), {
          phases: recovery ? ["submitted"] : ["pending", "authorized"],
          exclude: Array.from(active.keys()),
          limit: available,
        });
        for (const auction of due) {
          // Reserve the bid before starting I/O; overlapping ticks must not
          // authorize or submit the same payment twice as its phase changes.
          const task = Promise.resolve()
            .then(() => attempt(auction))
            .finally(() => {
              active.delete(auction.bidRequestId);
            });
          active.set(auction.bidRequestId, { recovery, task });
        }
      }
      await Promise.all(Array.from(active.values(), (job) => job.task));
    },
    start() {
      stopping = false;
      if (!timer)
        timer = setInterval(() => {
          void this.runOnce().catch(() =>
            console.error(
              "Publisher settlement worker could not access durable state",
            ),
          );
        }, config.workerIntervalMs);
    },
    async stop() {
      stopping = true;
      if (timer) clearInterval(timer);
      timer = undefined;
      await Promise.allSettled(Array.from(active.values(), (job) => job.task));
    },
  };
}
