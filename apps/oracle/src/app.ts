import { parse, type DefaultTreeAdapterTypes } from "parse5";
import { ZodError } from "zod";
import { authenticate } from "./auth";
import type { OracleConfig } from "./config";
import {
  commitmentDigest,
  hashHex,
  keyIdentity,
  signDigest,
  swapDigest,
  verifyEvent,
  verifySignature,
} from "./crypto";
import { OracleError, requireCondition } from "./errors";
import { decodeUtf8, parseJson } from "./json";
import { verifyPayment } from "./payment";
import {
  authorizationSchema,
  bidNonce,
  bidRequestSchema,
  hex32,
  impressionId,
} from "./schemas";
import type { OracleStore } from "./store";

export const MAX_BODY_BYTES = 2 * 1024 * 1024;
const pixel = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);
const noStore = { "cache-control": "no-store" };

async function readBody(request: Request): Promise<Uint8Array> {
  requireCondition(
    Number(request.headers.get("content-length") ?? 0) <= MAX_BODY_BYTES,
    "payload_too_large",
    413,
  );
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new OracleError(413, "payload_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new Uint8Array(Buffer.concat(chunks));
}

function hasPixel(html: string, expected: string): boolean {
  // Parse without fetching assets or executing scripts. Comments, scripts, and
  // template contents do not count as an embedded image.
  const pending: DefaultTreeAdapterTypes.Node[] = [parse(html)];
  while (pending.length) {
    const node = pending.pop()!;
    if (
      "tagName" in node &&
      node.tagName === "img" &&
      node.attrs.some((a) => a.name === "src" && a.value === expected)
    )
      return true;
    if ("childNodes" in node)
      for (const child of node.childNodes) pending.push(child);
  }
  return false;
}

function isBusy(error: unknown): boolean {
  for (
    let current = error, depth = 0;
    current instanceof Error && depth < 5;
    depth++
  ) {
    if (
      "code" in current &&
      (current.code === "SQLITE_BUSY" || current.code === "SQLITE_LOCKED")
    )
      return true;
    current = current.cause;
  }
  return false;
}

export function createOracle(
  config: OracleConfig,
  store: OracleStore,
  clock = () => Math.floor(Date.now() / 1000),
) {
  return async (request: Request): Promise<Response> => {
    const now = clock();
    try {
      const url = new URL(request.url);
      requireCondition(!url.search, "not_found", 404);
      if (url.pathname.startsWith("/pixel/")) {
        requireCondition(request.method === "GET", "method_not_allowed", 405);
        const segments = url.pathname.split("/");
        requireCondition(segments.length === 5, "not_found", 404);
        const requestId = hex32.parse(segments[2]);
        const impression = impressionId.parse(segments[3]);
        const nonce = bidNonce.parse(segments[4]);
        store.observe(requestId, impression, nonce, now);
        return new Response(pixel, {
          headers: {
            ...noStore,
            "content-type": "image/gif",
            "cross-origin-resource-policy": "cross-origin",
          },
        });
      }
      requireCondition(url.pathname === "/authorize", "not_found", 404);
      requireCondition(request.method === "POST", "method_not_allowed", 405);
      requireCondition(
        /^application\/json(?:\s*;.*)?$/i.test(
          request.headers.get("content-type") ?? "",
        ),
        "unsupported_media_type",
        415,
      );
      const body = await readBody(request);
      const publisher = authenticate(
        request,
        body,
        config.authorizationUrl,
        now,
      );
      const auth = authorizationSchema.parse(parseJson(decodeUtf8(body)));
      requireCondition(
        auth.request.kind === 28300 && verifyEvent(auth.request),
        "invalid_bid_request",
      );
      requireCondition(
        publisher === auth.request.pubkey,
        "publisher_mismatch",
        403,
      );
      const terms = bidRequestSchema.parse(parseJson(auth.request.content));
      requireCondition(
        terms.oracle.pubkey === config.identity &&
          keyIdentity(terms.oracle.payment_pubkey) ===
            keyIdentity(config.paymentPubkey) &&
          terms.oracle.pixel_base === config.pixelBase,
        "oracle_mismatch",
      );
      requireCondition(
        terms.banner_sizes.some(
          (s) =>
            s.width === auth.creative.width &&
            s.height === auth.creative.height,
        ),
        "creative_size_mismatch",
      );
      requireCondition(
        hashHex(auth.payment) === auth.commitment.payment_hash &&
          hashHex(auth.creative.content) === auth.commitment.creative_hash,
        "commitment_mismatch",
      );
      const payment = verifyPayment(
        auth.payment,
        terms,
        auth.commitment.bidder_pubkey,
      );
      requireCondition(
        verifySignature(
          auth.commitment.sig,
          commitmentDigest(auth, terms.impression_id),
          payment.refundKey,
        ),
        "invalid_commitment",
      );
      const expectedPixel = `${config.pixelBase}/${auth.request.id}/${terms.impression_id}/${auth.bid_nonce}`;
      requireCondition(
        hasPixel(auth.creative.content, expectedPixel),
        "pixel_url_mismatch",
      );
      const digest = swapDigest(payment.inputs, auth.outputs);
      const signature = store.authorize(
        auth,
        terms.impression_id,
        config.paymentPubkey,
        now,
        () => signDigest(digest, config.privateKey),
      );
      return Response.json({ signature }, { headers: noStore });
    } catch (error) {
      if (error instanceof OracleError)
        return Response.json(
          { error: error.code },
          { status: error.status, headers: noStore },
        );
      if (error instanceof ZodError)
        return Response.json(
          { error: "invalid_request" },
          { status: 400, headers: noStore },
        );
      if (isBusy(error))
        return Response.json(
          { error: "temporarily_unavailable" },
          { status: 503, headers: noStore },
        );
      // Never log submitted tokens, secrets, creatives, or authorization headers.
      console.error(
        "Oracle request failed",
        error instanceof Error ? error.name : "UnknownError",
      );
      return Response.json(
        { error: "internal_error" },
        { status: 500, headers: noStore },
      );
    }
  };
}
