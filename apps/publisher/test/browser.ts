import { chromium } from "playwright";
import { mkdtempSync, readdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { createPublisher } from "../src/app";
import { openStore } from "../src/store";
import { config, fundedBid, bidderIdentity, refundKey } from "./fixtures";
import { commitmentDigest, hashHex, signDigest } from "../src/crypto";

function assert(value: unknown, message: string): void {
  if (!value) throw new Error(message);
}
const temp = mkdtempSync(join(tmpdir(), "rob-browser-"));
const key = join(temp, "key.pem"),
  cert = join(temp, "cert.pem");
const openssl = Bun.spawnSync(
  [
    "openssl",
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    key,
    "-out",
    cert,
    "-days",
    "1",
    "-subj",
    "/CN=localhost",
    "-addext",
    "subjectAltName=IP:127.0.0.1,DNS:localhost",
  ],
  { stdout: "ignore", stderr: "pipe" },
);
assert(openssl.exitCode === 0, "Could not create local test certificate");
const tls = { key: Bun.file(key), cert: Bun.file(cert) };
let pixels = 0,
  assetLoads = 0,
  auctionCalls = 0,
  serveOriginal = "";
const assets = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  tls,
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/pixel/")) {
      pixels++;
      return new Response(new Uint8Array([71, 73, 70]), {
        headers: { "content-type": "image/gif" },
      });
    }
    if (url.pathname === "/script.js") {
      assetLoads++;
      return new Response("document.body.dataset.external='loaded'", {
        headers: { "content-type": "text/javascript" },
      });
    }
    return new Response("landing");
  },
});
const assetOrigin = `https://127.0.0.1:${assets.port}`;
const store = openStore(":memory:");
let handler: (request: Request) => Promise<Response>;
const publisher = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  tls,
  fetch(request) {
    if (
      request.method === "POST" &&
      new URL(request.url).pathname === "/v1/auctions"
    )
      auctionCalls++;
    return handler(request);
  },
});
const publisherOrigin = `https://127.0.0.1:${publisher.port}`;
const sdk = await Bun.file(
  new URL("../../../packages/publisher-sdk/dist/index.js", import.meta.url),
).text();
const site = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  tls,
  fetch(request) {
    if (new URL(request.url).pathname === "/sdk.js")
      return new Response(sdk, {
        headers: { "content-type": "text/javascript" },
      });
    return new Response(
      `<div id="ad"></div><script type="module">
    import {createPublisher} from '/sdk.js';
    window.client=createPublisher({endpoint:'${publisherOrigin}/v1/auctions'});
    window.placement=client.definePlacement({id:'sidebar',element:document.querySelector('#ad'),sizes:[{width:300,height:250}]});
    window.ready=true;
  </script>`,
      { headers: { "content-type": "text/html" } },
    );
  },
});
const siteOrigin = `https://127.0.0.1:${site.port}`;
const base = config();
const cfg = config({
  publicUrl: publisherOrigin,
  allowedOrigins: [siteOrigin],
  oracle: { ...base.oracle, pixel_base: assetOrigin + "/pixel" },
  auctionSeconds: 1,
});
handler = createPublisher(cfg, store, {
  async publish(event, receive) {
    const bid = fundedBid(event);
    const pixel = `${assetOrigin}/pixel/${event.id}/${bid.impression_id}/${bid.bid_nonce}`;
    bid.creative.content = `<html><body style="background:rgb(1,2,3)"><a target="_blank" href="${assetOrigin}/landing">Visit</a><img src="${pixel}"><script src="${assetOrigin}/script.js"></script><script>
    document.body.dataset.ran='yes';
    try { parent.document.body.dataset.broken='yes'; } catch { document.body.dataset.parentBlocked='yes'; }
    try { localStorage.setItem('probe','yes'); } catch { document.body.dataset.storageBlocked='yes'; }
    try { top.location.href='${assetOrigin}/escape'; } catch { document.body.dataset.navigationBlocked='yes'; }
  </script></body></html>`;
    serveOriginal = bid.creative.content;
    bid.commitment.creative_hash = hashHex(bid.creative.content);
    bid.commitment.sig = signDigest(
      commitmentDigest(
        {
          request: event,
          payment: bid.payment,
          bid_nonce: bid.bid_nonce,
          creative: bid.creative,
          commitment: bid.commitment,
          outputs: [],
        },
        bid.impression_id,
      ),
      refundKey,
    );
    receive({ sender: bidderIdentity, content: bid, receivedAt: Date.now() });
    return () => {};
  },
  close() {},
});

let executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
if (!executablePath && !existsSync(chromium.executablePath())) {
  const cache = join(homedir(), ".cache/ms-playwright");
  if (existsSync(cache))
    executablePath = readdirSync(cache)
      .filter((p) => p.startsWith("chromium-"))
      .sort()
      .reverse()
      .map((p) => join(cache, p, "chrome-linux64/chrome"))
      .find(existsSync);
}
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await page.goto(siteOrigin);
  await page.waitForFunction(() => Boolean((window as any).ready));
  assert(auctionCalls === 0, "Defining a placement started an auction");
  const result = await page.evaluate(async () => {
    const w = window as any;
    const result = await w.client.load(w.placement);
    return { status: result.status, id: result.bidRequestId };
  });
  assert(result.status === "filled", "SDK did not fill placement");
  const iframe = page.frameLocator("iframe");
  await iframe
    .locator(
      "body[data-ran=yes][data-parent-blocked=yes][data-storage-blocked=yes][data-external=loaded]",
    )
    .waitFor();
  assert(page.url() === siteOrigin + "/", "Creative navigated publisher page");
  assert(
    (await page.locator("iframe").getAttribute("width")) === "300",
    "Wrong dimensions",
  );
  assert(
    pixels === 1 && assetLoads === 1,
    "Embedded pixel or external script not loaded once",
  );
  assert(auctionCalls === 1, "SDK repeated the auction request");
  const src = await page.locator("iframe").getAttribute("src");
  const response = await context.request.get(src!);
  assert(
    (await response.text()) === serveOriginal,
    "Creative body changed in delivery",
  );
  const popupPromise = page.waitForEvent("popup");
  await iframe.getByText("Visit").click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  assert(
    popup.url() === assetOrigin + "/landing",
    "Landing page did not open in new tab",
  );
  await page.route(publisherOrigin + "/v1/auctions", (route) =>
    route.fulfill({
      status: 503,
      body: "unavailable",
      headers: { "access-control-allow-origin": siteOrigin },
    }),
  );
  let failedRequests = 0;
  page.on("request", (request) => {
    if (request.url() === publisherOrigin + "/v1/auctions") failedRequests++;
  });
  const failed = await page.evaluate(async () => {
    const w = window as any;
    try {
      await w.client.load(w.placement);
      return false;
    } catch {
      return true;
    }
  });
  assert(
    failed && failedRequests === 1,
    "Failed load did not terminate after one request",
  );
  console.info(
    "Browser proof passed: explicit load, CORS, exact HTML, dimensions, scripts, pixel, isolation, new-tab landing, terminal failure.",
  );
} finally {
  await browser.close();
  await publisher.stop(true);
  await site.stop(true);
  await assets.stop(true);
  store.close();
  rmSync(temp, { recursive: true, force: true });
}
