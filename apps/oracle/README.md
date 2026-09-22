# ROB oracle

A standalone Bun service that verifies a bidder's creative/payment commitment, records its pixel callback, and returns a Cashu `SIG_ALL` spending signature. The publisher authenticates with NIP-98 and supplies the exact original token, HTML, signed bid request, commitment, and ordered swap outputs.

## Run

Use the workspace's pinned Bun 1.3.14. From the repository root:

```sh
bun install --frozen-lockfile
cp apps/oracle/.env.example apps/oracle/.env
# Fill in ORACLE_PUBKEY and ORACLE_PAYMENT_PRIVATE_KEY in apps/oracle/.env.
bun run dev:oracle
```

For a normal process without file watching, use `bun run start:oracle`. Bun loads the app's `.env`. Configuration errors report field names without secret values.

`ORACLE_PUBKEY` is the trusted oracle Nostr identity's public key. `ORACLE_PAYMENT_PRIVATE_KEY` is its stable Cashu signing secret; it must survive restarts. Its compressed public key is the value publishers put in `oracle.payment_pubkey`. Derive that public key from the configured secret, from this app directory:

```sh
bun -e 'import { secp256k1 } from "@noble/curves/secp256k1.js"; console.log(Buffer.from(secp256k1.getPublicKey(Buffer.from(process.env.ORACLE_PAYMENT_PRIVATE_KEY, "hex"), true)).toString("hex"))'
```

The remaining defaults are database `data/oracle.sqlite`, bind address `127.0.0.1`, and port `3000`. Set `ORACLE_PUBLIC_URL` to the public HTTPS origin, for example `https://oracle.example`. Loopback HTTP is supported for local development. Use TLS termination in front of the Bun listener for public deployment. The configured public origin determines both endpoints; forwarded host/protocol headers do not affect NIP-98 verification.

## HTTP contract

| Endpoint | Behavior |
| --- | --- |
| `GET /pixel/{bid_request_id}/{impression_id}/{bid_nonce}` | Persist the observation and return a transparent 1×1 GIF with `Cache-Control: no-store`. Public; no registration needed. |
| `POST /authorize` | Verify NIP-98, evidence, and callback; atomically persist and return `{ "signature": "<128 hex characters>" }`. |

Both routes reject query strings and unsupported methods. The pixel uses the identifier formats in [NOSTR.md](../../NOSTR.md#identifier-formats). Duplicate callbacks are idempotent, persist across restarts, and have no automatic expiry.

Authorization requires `Content-Type: application/json` and the [authorization payload](../../NOSTR.md#5-oracle-authorization-payload). NIP-98's `u` must equal the configured public `/authorize` URL, `method` must be `POST`, and `payload` must hash the exact UTF-8 HTTP body bytes. Each required tag must occur exactly once with one value. The signed kind-27235 event has empty content; its signer must equal the original signed request's publisher. Its timestamp must be within 60 seconds either side of receipt, inclusive. Authentication is checked on every retry.

Errors have the form `{ "error": "<code>" }`, with `Cache-Control: no-store`:

| HTTP | Codes / meaning |
| --- | --- |
| 400 | `invalid_request`, `invalid_json`, `invalid_utf8`, `invalid_bid_request`, `oracle_mismatch`, `creative_size_mismatch`, `commitment_mismatch`, `invalid_commitment`, `pixel_url_mismatch`, `invalid_payment`, `mint_not_accepted`, `invalid_payment_conditions`, `mixed_payment_conditions`, `duplicate_inputs` |
| 401 | `unauthorized`: missing, invalid, stale, or incorrectly bound NIP-98 |
| 403 | `publisher_mismatch`: valid authentication from a different publisher |
| 409 | `pixel_not_observed`: retry after the callback; nothing is reserved |
| 409 | `authorization_conflict`: an issued authorization fixed a different bid or output set |
| 413 | `payload_too_large` |
| 415 | `unsupported_media_type` |
| 404 / 405 | `not_found` / `method_not_allowed` |
| 503 | `temporarily_unavailable`: SQLite contention; retry with fresh authentication if necessary |
| 500 | `internal_error`: no signature released for a failed transaction |

The service body limit is 2 MiB, including the signed request and full payment/HTML. The NIP-98 header limit is 16 KiB. These are implementation limits, not the still-open common ROB request/bid transport budgets. Bun may reject an oversized request before the application runs, in which case its native 413 response applies.

JSON must have valid UTF-8 and Unicode strings, unique object keys, and nesting no deeper than 64 levels. ROB objects reject unknown fields; optional OpenRTB `site`/`device` content is preserved, with prohibited field names rejected recursively. Cashu V4 unknown fields are ignored as required by NUT-00. Mint URLs are compared exactly, without trailing slashes, query strings, fragments, or credentials. No remote URL is fetched.

Output amounts are nonnegative safe JSON integers (`0..9007199254740991`); `B_` is compressed-point hex syntax, preserving hex case. This bounds deterministic API parsing; it does not validate denominations, curve points, duplicates, balance, or fees. The publisher owns those checks. Input amounts can be CBOR integers beyond the JSON safe range and are summed exactly using `bigint`.

The pixel check parses HTML and requires an `img` element whose decoded `src` is exactly the expected absolute pixel URL. Comments, script text, and inert template content do not count. No scripts run and no assets are fetched. This checks the committed payload and callback, not display or viewability.

## Persistence and retries

Drizzle applies the checked-in SQLite migration at startup using `bun:sqlite`. The two tables hold callback observations and permanent issued authorizations. WAL, full synchronous durability, and a five-second busy timeout are configured. A `BEGIN IMMEDIATE` transaction checks the opportunity, checks the callback, signs, and persists the commitment, exact payment token, ordered outputs, oracle payment key, and returned signature before returning it.

For a retry, the opportunity, nonce, full commitment (including its signature bytes), original payment string, ordered output amounts and `B_` strings, and oracle payment key must match. HTTP JSON whitespace/property ordering and the refreshed NIP-98 event can differ. Validated commitment hashes cover the original HTML and chosen dimensions. Exact retries return the stored signature without requiring a new callback. Changing outputs or selecting another bid is forbidden after authorization, including after refund eligibility or settlement failure.

Keep the database and signing configuration stable. Key rotation and callback cleanup are outside this MVP. The service never contacts a mint, resolves keysets, checks funding authenticity/spendability, submits settlement, or subscribes to Nostr relays. The publisher must retain its own output secrets and blinding factors.

## Checks and layout

From the repository root:

```sh
bun test apps/oracle/test
bun run typecheck
bun run lint
bun run build
```

The HTTP test binds an ephemeral loopback port. Tests cover complete signed fixtures, official Cashu signing vectors, malformed evidence, callback order, atomic failure, concurrent requests, restart durability, and authenticated retries. Funding and full mint settlement integration tests will follow the bidder/publisher adapters.

`src/app.ts` coordinates HTTP and verification, `payment.ts` interprets local Cashu conditions, `crypto.ts` holds signing constructions, and `store.ts` owns persistence. Zod schemas live in `schemas.ts`; no shared protocol package is introduced before the adapters need one. To generate a migration after changing `src/db-schema.ts`, run `bun run --filter @rob/oracle db:generate`. Build output is `dist/index.js`, run with Bun alongside this app's `drizzle/` directory and installed dependencies.

The complete fixture and upstream vector provenance are described in [test/fixtures/README.md](test/fixtures/README.md).
