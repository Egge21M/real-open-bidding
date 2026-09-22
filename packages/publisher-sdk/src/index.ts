/** A fixed-size alternative for one offered banner, in CSS pixels. */
export interface BannerSize {
  width: number;
  height: number;
}
/** Explicit opt-in only. The SDK never reads page URLs or device metadata. */
export interface AdvertisingContext {
  site?: {
    page?: string;
    name?: string;
    cat?: string[];
    content?: { title?: string; language?: string; keywords?: string };
  };
  device?: {
    ua?: string;
    language?: string;
    w?: number;
    h?: number;
    dnt?: 0 | 1;
  };
}
export interface Placement {
  id: string;
  element: HTMLElement;
  sizes: readonly BannerSize[];
}
export type AdResult =
  | { status: "filled"; frame: HTMLIFrameElement; bidRequestId: string }
  | { status: "no_fill"; bidRequestId: string };

export class PublisherError extends Error {
  constructor(
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(code);
    this.name = "PublisherError";
  }
}

function isSize(value: unknown): value is BannerSize {
  if (!value || typeof value !== "object") return false;
  const size = value as BannerSize;
  return (
    Number.isSafeInteger(size.width) &&
    size.width > 0 &&
    size.width <= 8192 &&
    Number.isSafeInteger(size.height) &&
    size.height > 0 &&
    size.height <= 8192
  );
}

/** No globals, timers, automatic metadata collection, or automatic retries. */
export function createPublisher(options: {
  endpoint: string;
  fetch?: typeof globalThis.fetch;
}) {
  const endpoint = new URL(options.endpoint);
  if (
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    !(
      endpoint.protocol === "https:" ||
      (endpoint.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname))
    )
  ) {
    throw new PublisherError("invalid_endpoint");
  }
  const request = options.fetch ?? globalThis.fetch.bind(globalThis);
  const placements = new Set<Placement>();
  return {
    definePlacement(input: Placement): Placement {
      if (
        !/^[A-Za-z0-9_-]{1,64}$/.test(input.id) ||
        !input.element ||
        !Array.isArray(input.sizes) ||
        !input.sizes.length ||
        input.sizes.length > 32 ||
        !input.sizes.every(isSize)
      )
        throw new PublisherError("invalid_placement");
      const placement = Object.freeze({
        ...input,
        sizes: Object.freeze(input.sizes.map((s) => Object.freeze({ ...s }))),
      });
      placements.add(placement);
      return placement;
    },
    async load(
      placement: Placement,
      options: { context?: AdvertisingContext; signal?: AbortSignal } = {},
    ): Promise<AdResult> {
      if (!placements.has(placement))
        throw new PublisherError("unknown_placement");
      const response = await request(endpoint.href, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        signal: options.signal,
        body: JSON.stringify({
          placement: placement.id,
          sizes: placement.sizes,
          ...(options.context ? { context: options.context } : {}),
        }),
      });
      if (!response.ok)
        throw new PublisherError("auction_failed", response.status);
      const result: unknown = await response.json();
      options.signal?.throwIfAborted();
      if (!result || typeof result !== "object")
        throw new PublisherError("invalid_response");
      const data = result as Record<string, unknown>;
      if (
        typeof data.bid_request_id !== "string" ||
        !/^[a-f0-9]{64}$/.test(data.bid_request_id)
      )
        throw new PublisherError("invalid_response");
      if (data.status === "no_fill")
        return { status: "no_fill", bidRequestId: data.bid_request_id };
      if (
        data.status !== "filled" ||
        typeof data.creative_url !== "string" ||
        !isSize(data) ||
        !placement.sizes.some(
          (s) => s.width === data.width && s.height === data.height,
        )
      )
        throw new PublisherError("invalid_response");
      const creative = new URL(data.creative_url);
      if (
        creative.origin !== endpoint.origin ||
        creative.username ||
        creative.password ||
        creative.search ||
        creative.hash ||
        !/^\/v1\/creatives\/[a-f0-9]{64}$/.test(creative.pathname)
      )
        throw new PublisherError("invalid_creative_url");
      const frame = placement.element.ownerDocument.createElement("iframe");
      frame.title = "Advertisement";
      frame.setAttribute(
        "sandbox",
        "allow-scripts allow-popups allow-popups-to-escape-sandbox",
      );
      frame.referrerPolicy = "no-referrer";
      frame.width = String(data.width);
      frame.height = String(data.height);
      frame.style.border = "0";
      frame.style.display = "block";
      frame.src = creative.href;
      options.signal?.throwIfAborted();
      placement.element.replaceChildren(frame);
      return { status: "filled", frame, bidRequestId: data.bid_request_id };
    },
  };
}
