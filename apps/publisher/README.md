# Publisher server MVP

A standalone Bun service for one publisher and multiple allowed websites. It publishes Nostr bid requests, validates funded bids locally, selects one creative, and settles payments into a local Cashu wallet. SQLite through Drizzle retains selection and payment recovery state; Zod validates boundary data. The independent [browser SDK](../../packages/publisher-sdk/README.md) declares placements and loads ads.

The agreed behavior is in [PUBLISHER.md](../../PUBLISHER.md). This implementation uses a documented local wire profile while remaining shared-protocol decisions are resolved. Its controlled tests are not a claim of live bidder/mint interoperability.

## Run

Install with Bun 1.3.14 from the repository root:

```sh
bun install --frozen-lockfile
cd apps/publisher
cp publisher.example.json publisher.json
cp .env.example .env
```

Fill in `publisher.json` and `.env` before starting:

- `publicUrl`: the externally reachable publisher HTTPS origin. The built-in listener is HTTP; terminate TLS at your reverse proxy and forward requests to `hostname:port`. Set the proxy timeout above the auction window plus the network timeout. Loopback HTTP is allowed for development.
- `allowedOrigins`: exact website origins, including ports when present. Placements need no server registration.
- `relays`: usable `wss:` relays accepting kinds 28300 and 21059. Local `ws:` is allowed on loopback.
- `oracle`: independently authenticated Nostr identity, compressed Cashu payment public key, pixel base, and exact authorization URL. Match the chosen oracle installation; these keys need not be identical.
- `mints`: accepted mint URLs and saved public keysets, provisioned as below.
- `PUBLISHER_IDENTITY_PRIVATE_KEY`: a secret 32-byte secp256k1 key in lowercase hex, used for Nostr event signing and HTTP authentication.
- `PUBLISHER_PAYMENT_SEED`: a separate secret random 32-byte value in lowercase hex. It derives fresh payment keys with random per-auction input; each resulting key is persisted before publication. The seed alone cannot recover a lost database.

Generate each secret independently with `openssl rand -hex 32`, store it in `.env`, and restrict that file to the service account. Keep both values stable across restarts. `PUBLISHER_CONFIG` defaults to `publisher.json`; relative paths are resolved from the working directory.

```sh
bun run start
# GET http://127.0.0.1:3001/health -> {"status":"ok"}
```

Use one server process per database. The worker is in-process; multiple replicas sharing a database are unsupported. Persist the database directory, including SQLite's WAL files, and take consistent SQLite backups. The database contains payment keys, output secrets, blinding factors, and bearer proofs. Startup applies the checked-in Drizzle migrations. Interrupted collecting auctions fail; selected payment work resumes. SIGINT/SIGTERM stop new requests and drain current work.

## Saved mint keys

Explicit provisioning can fetch the selected mint's keysets over HTTPS before accepting auctions:

```sh
bun run mint-keys https://your-mint.example > mint-keys.local.json
```

This emits one `{ "url", "keysets" }` object to insert in the configuration's `mints` array. Choose and authenticate the mint endpoint yourself; this command does not discover or endorse mints. It fetches sat keysets, including inactive input keysets. Startup verifies keyset IDs against denomination public keys, accepts only sat units, and requires an active output keyset. Snapshot format:

```json
{
  "url": "https://your-mint.example",
  "keysets": [{
    "id": "<full keyset ID>",
    "unit": "sat",
    "active": true,
    "input_fee_ppk": 100,
    "keys": { "1": "<compressed public key>", "2": "<compressed public key>" }
  }]
}
```

Keep all denominations from the mint; abbreviated examples are not valid keyset snapshots. Optional `final_expiry` is a Unix timestamp. Supported IDs are NUT-02 v1 and v2; abbreviated v2 input IDs must resolve uniquely. Refresh snapshots explicitly when keys or fees change and restart with the updated file. Previously selected swaps retain their saved output keys and exact output plan. Unknown keys, missing/invalid DLEQ, invalid auction locks, or refund-eligible proofs make bids ineligible. No mint key fetch or spend-state query runs during acceptance.

## Browser HTTP contract

`POST /v1/auctions` accepts JSON from a configured `Origin`, with no credentials:

```json
{
  "placement": "sidebar",
  "sizes": [{ "width": 300, "height": 250 }, { "width": 300, "height": 600 }]
}
```

One call creates one impression with alternative sizes. Placement IDs use 1–64 ASCII letters, digits, `_` or `-`; 1–32 sizes are accepted, each dimension an integer from 1 to 8192 CSS pixels. The placement ID stays local and is not inserted into signed ROB payloads. Requests are limited to 32 KiB. Duplicate JSON keys, invalid Unicode, unknown fields, prohibited context, and disallowed origins fail validation.

Optional `context` allows only:

- `site.page`, `site.name`, `site.cat`, and `site.content.{title,language,keywords}`.
- `device.{ua,language,w,h,dnt}`; `dnt` is 0 or 1.

The server derives `site.domain` from the allowed request origin. A supplied page URL must share that origin and contain no credentials, query, or fragment; supply a suitable canonical page URL explicitly. Text is limited to 2048 characters, language/category values to 64, categories to 32, and device dimensions to 65536. Nothing is inferred from cookies, request IP, user agent, or referrer. Do not put viewer identifiers in free-text context; accepted context is publicly broadcast.

Successful responses are one of:

```json
{ "status": "no_fill", "bid_request_id": "<64 hex>" }
```

```json
{
  "status": "filled",
  "bid_request_id": "<64 hex>",
  "creative_url": "https://publisher.example/v1/creatives/<opaque 64 hex>",
  "width": 300,
  "height": 250
}
```

Errors return a non-2xx status and `{ "error": "code" }`. Invalid input is 400, disallowed origin 403, oversize input 413, unsupported media type 415, and capacity/relay failure 503. There are no request retries, idempotency keys, or response replay. A connection failure does not cancel already persisted work. No-fill is a successful auction outcome.

`GET /v1/creatives/:token` serves the selected original HTML with sandbox/CSP headers and no caching. It never starts another auction or replaces the selection. Delivery does not wait for payment authorization or settlement. Creative URLs have no separate expiry in this MVP.

## Local Nostr and oracle profile

The server signs kind 28300 requests using the proposed v1 shape in [NOSTR.md](../../NOSTR.md). Each contains one random `impression_id`, sizes, context, accepted mints, a fresh compressed payment key, oracle declaration, and `closes_at`.

The collector subscribes to recipient-tagged kind 21059 gift wraps before publishing. One relay's positive event acknowledgement is sufficient. It verifies and decrypts the NIP-44/NIP-59 wrapper and kind 13 seal, then verifies the unsigned kind 28301 rumor ID and sender binding. The rumor has exactly one `p` tag for the publisher and one `e` tag for the signed request ID. Its JSON content follows the proposed bid example:

```text
version: 1
bid_request_id, impression_id, bid_nonce
amount_sat: positive integer
creative: { type: "html", content, width, height }
payment: original cashuB string, including DLEQ
commitment: { bidder_pubkey, creative_hash, payment_hash, sig }
```

`bid_nonce` is 16 bytes encoded as lowercase hex. The commitment and 2-of-2 `SIG_ALL` lock/refund rules follow [FLOW.md](../../FLOW.md). Bids are immutable; exact retransmissions are ignored, conflicting nonces and proof reuse are rejected. The amount must equal gross proof value. Redemption fees are `ceil(sum(input_fee_ppk) / 1000)` sats; highest positive net wins, first valid receipt breaks ties. The server chooses at the deadline and rejects funding that is refund eligible by selection. A still-future refund may race with subsequent settlement; collection is not a payment guarantee.

The default auction window is 2 seconds, with integer-second `closes_at` rounded up; actual collection lasts 2–3 seconds. Configurable limits: `auctionSeconds` 1–30, `maxConcurrentAuctions` 100 by default, `maxBidsPerAuction` 100, and `networkTimeoutMs` 5000. The relay frame cap is 768 KiB; HTML is capped at 128 Ki characters and token text at 256 Ki characters, additionally bounded by the NIP-44 transport. These are local implementation limits.

The authorization request matches the current oracle implementation: HTTP POST to configured `authorizationUrl`, with `request`, original `payment`, `bid_nonce`, original creative content/dimensions, `commitment`, and ordered outputs containing `amount`/`B_`. Every attempt uses a fresh kind 27235 NIP-98 event with exact `u`, `method=POST`, and the SHA-256 `payload` hash of the transmitted JSON. The publisher verifies the returned Schnorr signature against the declared oracle payment key and exact swap digest. Endpoint names, error envelopes, and this wire profile remain implementation choices pending shared conformance work.

## Creative and payment behavior

HTML, inline styles and scripts, HTTPS resources, and new-tab landing links are supported. Static resource attributes and inline CSS references are checked for absolute HTTPS URLs; fragments used for document-local references are allowed. Base elements, CSP/refresh meta directives, nested documents, forms, objects, and `srcset` are unsupported in this implementation. The bidder supplies the exact oracle pixel as an image. No validator fetches it.

The original HTML is served unchanged. CSP permits inline scripts/styles and HTTPS script/image/style/font/connect resources, denies base/form/object/frame features, restricts embedding to the requesting website origin, and applies `sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox`. The SDK applies the same iframe sandbox without `allow-same-origin` or top-navigation permissions. Browser policy enforces isolation; static validation cannot establish arbitrary JavaScript's behavior. Bidders must also use absolute HTTPS URLs in runtime code and external resources. The iframe does not guarantee viewability or cookieless networking.

Selection and the exact ordered swap plan are committed to SQLite before the creative reference leaves the server. No fallback replaces that bid. The worker starts every `workerIntervalMs` (default 1000), retries missing pixels/network failures with bounded exponential backoff, and persists the oracle signature before spending. Output secrets and blinding factors never change on retries. Swap inputs exclude private DLEQ `r` values.

A submitted swap with an uncertain response is reconciled using NUT-09 `/v1/restore` for the saved blinded outputs. Before refund eligibility, an empty restore permits the identical swap again. After refund eligibility, submitted work remains unresolved and is reconciled without starting new swaps. A mint must support NUT-09 for automatic recovery; unavailable recovery stays pending. Completed proceeds are saved atomically and credited once. Changing publisher/oracle identity with pending authorization work records `recovery_configuration_mismatch`; restore the original configuration to resume it.

Inspect recorded payment state:

```sh
bun run wallet status
```

Export retained bearer proofs, grouped into a cashuB token per mint:

```sh
umask 077
bun run wallet export > proceeds.local
```

Export copies proofs; it does not spend, delete, or mark them withdrawn. Repeated exports contain the same retained proofs. `recordedProceeds` is a settlement ledger, not a live spendable balance after an external wallet imports/spends them. Withdrawal management and mint spend-state polling are outside this MVP. There is no public wallet HTTP endpoint.

## Validation

From the repository root:

```sh
bun run test:publisher
bun run test:publisher:browser
bun run lint
bun run typecheck
bun run build
```

The browser check needs OpenSSL and Playwright Chromium. Install Chromium if absent with `cd apps/publisher && bunx playwright install chromium`; `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can point to an existing installation. The test creates local HTTPS endpoints and drives the built SDK in Chromium.

Tests cover published Cashu NUT-00/NUT-12 vectors, bid/lock/DLEQ eligibility, deadlines, selection, proof reuse, encrypted WebSocket delivery, the real oracle handler as a controlled counterpart, missing pixels, lost mint responses, persistent recovery, and browser isolation. Full end-to-end integration with independently operated bidder, relay, oracle, and mint components remains deferred.
