# ROB publisher browser SDK

A standalone TypeScript package targeting modern browsers, with zero runtime dependencies. It defines banner placements, makes one publisher-server request per explicit load, and renders a selected creative in a sandboxed iframe. It holds no keys or payment proofs and performs no auctions itself.

Build from this workspace:

```sh
bun install --frozen-lockfile
bun run --filter @rob/publisher-sdk build
```

The output is `dist/index.js` (browser ESM) plus TypeScript declarations. Import `@rob/publisher-sdk` through a bundler or host `dist/index.js` yourself and import that URL from a module script. The package is independently buildable; it has not been published to a registry by this change.

```ts
import { createPublisher } from "@rob/publisher-sdk";

const publisher = createPublisher({
  endpoint: "https://publisher.example/v1/auctions",
});
const sidebar = publisher.definePlacement({
  id: "sidebar",
  element: document.getElementById("sidebar-ad")!,
  sizes: [{ width: 300, height: 250 }, { width: 300, height: 600 }],
});

// Defining inventory does not send any request.
try {
  const result = await publisher.load(sidebar);
  if (result.status === "no_fill") {
    // The page decides how to present an empty placement.
  }
} catch (error) {
  // This ad load failed. The SDK will not retry it.
}
```

Each load offers a new impression with alternative sizes. There is no automatic refresh, visibility trigger, HTTP retry, or auction resumption. A subsequent explicit `load` creates a new opportunity. The caller should serialize loads for a placement; concurrent loads can complete in a different order. No-fill and failures leave existing placement contents unchanged. A filled result replaces them with the iframe and returns `{ status: "filled", bidRequestId, frame }`; no-fill returns `{ status: "no_fill", bidRequestId }`.

`load(placement, { signal })` accepts an `AbortSignal`. Aborting the browser request does not cancel persisted server-side payment work. For a browser deadline, pass `AbortSignal.timeout(...)` with enough time for the configured collection window and networking. There is no SDK timer by default.

Additional public context requires explicit opt-in:

```ts
await publisher.load(sidebar, {
  context: {
    site: {
      page: "https://site.example/articles/example",
      content: { title: "Example article", language: "en" },
    },
    device: { language: "en" },
  },
});
```

The SDK does not read or infer page URLs, device information, cookies, or identifiers. By default the server publishes only the allowed website's domain. Context is public; use the server's [allowlist and URL rules](../../apps/publisher/README.md#browser-http-contract) and keep viewer identifiers out of supplied values.

Configure the page's origin on the publisher server. If the page has a CSP, permit the publisher origin in `connect-src` and `frame-src`. Production endpoints require HTTPS; loopback HTTP works for development. HTTP requests omit credentials. The server returns the exact HTML document URL and committed dimensions; the SDK accepts only a creative URL on that server's origin and a size offered by the placement.

The iframe uses `allow-scripts allow-popups allow-popups-to-escape-sandbox`, an opaque origin, no referrer, and the committed dimensions. The server supplies the matching response-header policy. JavaScript and HTTPS assets can run inside the creative, new-tab landing links work, and parent DOM/storage access and top navigation are denied. A filled result means the frame was inserted, not that the image loaded, an impression was viewable, or payment settled.

The supported runtime needs ES2022, ES modules, Fetch, URL, AbortSignal, and DOM iframe sandbox support. `fetch` can be injected through `createPublisher` for testing. Run `bun run test` and `bun run typecheck` in this package; the server's browser proof exercises the built ESM package in Chromium.
