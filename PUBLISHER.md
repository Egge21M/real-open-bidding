# Publisher implementation design

Status: agreed publisher MVP design, 2026-09-22. Implementation and shared-protocol details deliberately deferred from this milestone's architecture are listed at the end.

The implementation is in [apps/publisher](apps/publisher/README.md) and the independent [browser SDK](packages/publisher-sdk/README.md). Their READMEs specify local endpoints, schemas, provisioning, limits, and validation commands; local implementation choices do not settle the shared-protocol questions below.

This document describes the default publisher implementation. [FLOW.md](FLOW.md) and [NOSTR.md](NOSTR.md) remain authoritative for protocol behavior, and [CONTEXT.md](CONTEXT.md) defines domain terms. Publisher development can proceed alongside the oracle MVP using its documented authorization contract.

The oracle contract is only partly settled: endpoint method/path, error envelopes, payload limits, and remaining authentication URL/tag rules are still open in [NOSTR.md](NOSTR.md#oracle-http-authentication). Current oracle code provides an implementation to integrate with, but its choices do not become protocol requirements automatically. Parallel development must resolve these remaining interface details before claiming interoperability.

## Agreed architecture

The publisher runs auctions and collects payments through a standalone Bun server. A small browser SDK declares inventory and available banner sizes, requests an auction, and renders the selected creative in an isolated iframe with JavaScript support. [ADR-0010](docs/adr/0010-server-side-publisher.md) records the server/browser split and its trade-off.

| Module | Responsibility |
| --- | --- |
| Browser SDK | Declare inventory and available sizes, make one auction request per explicit ad load, and load the publisher-served creative document at its committed dimensions in an isolated iframe with JavaScript support. |
| Publisher server | Own publisher signing keys and wallet state; publish bid requests; receive, validate, and select bids; return the selected creative; obtain oracle authorization and complete mint settlement. |
| Oracle | Check the committed evidence and matching pixel callback and authorize the particular swap under the existing protocol rules. |

**Agreed 2026-09-22:** each installation serves one publisher and may support multiple websites. Hosted operation for multiple independent publishers is outside this MVP. The deliverable is a standalone Bun server; an embeddable publisher library is not required for this milestone.

**Agreed 2026-09-22:** the SDK declares inventory and available sizes; individual placements do not require duplicate registration in server configuration. Publisher credentials, accepted mints, oracle configuration, allowed website origins, and auction/payment policy remain server-owned. The inventory and context rules are defined below; exact field names and numeric limits remain open.

**Agreed 2026-09-22:** the common v1 rendering profile supports JavaScript inside an isolated iframe, HTTPS assets and scripts, and advertiser landing pages in new tabs. The creative cannot access the publisher page's DOM or storage or navigate that page. The default renderer serves the unchanged signed HTML as a document with HTTP content policies, as specified below. See [ADR-0011](docs/adr/0011-javascript-in-isolated-iframes.md).

```mermaid
sequenceDiagram
    participant B as Browser SDK
    participant P as Publisher server
    participant N as Bidders through Nostr relays
    participant O as Oracle
    participant M as Cashu mint
    B->>P: Request a banner with available sizes
    P->>P: Derive and persist a fresh auction payment key
    P->>N: Publish signed bid request
    N-->>P: Deliver funded bids
    P->>P: Validate locally; select and persist one bid at closes_at
    P-->>B: Return creative document URL and committed dimensions
    B->>P: Load creative document in sandboxed iframe
    P-->>B: Serve exact HTML with content-policy headers
    B->>O: Request bidder-inserted pixel
    P->>O: Request payment authorization
    O-->>P: Return signature if checks pass
    P->>M: Complete the authorized swap
    M-->>P: Return settled proceeds if the spend succeeds
```

The diagram shows the successful path. Callback and authorization-request arrival may occur in either order; a missing callback produces the existing retryable `pixel_not_observed` result. The server must not wait for settlement before returning the creative. Payment processing continues independently of the browser request, and returning or rendering a selected creative is not a claim that payment has completed.

## Inventory and browser requests

**Agreed 2026-09-22:** page code defines placements and explicitly requests an ad for a placement. Defining a placement does not start an auction. A placement is reusable; each new ad load offers a separate impression through its own bid request. The first implementation has no automatic refresh or visibility-triggered auctions.

The SDK makes one auction request for an explicit ad load. Browser retries, HTTP idempotency keys, request resumption, and retry-driven response replay are outside this MVP. If the publisher server is unavailable or the request fails, that ad load fails; the SDK does not silently start another auction. No-fill is a completed auction with no eligible selection, distinct from a failed request. A failed browser connection does not prove that the server never processed the request or cancel already-persisted payment work.

The response supplies the selected creative document reference and committed dimensions, or a no-fill outcome. Payment tokens, signing keys, and swap recovery secrets remain on the server. Exact endpoint and response field names are implementation work. A subsequent explicit new ad load is a new opportunity, not a retry of the failed one.

The server accepts browser integrations from configured website origins. The SDK can declare placements dynamically within that policy, and the server validates declared sizes and context before publishing a signed bid request. Origin checks limit permitted browser integrations; they do not authenticate a real page view or establish that an impression occurred.

**Agreed 2026-09-22:** the default public advertising context contains only the required `site.domain`. Additional page/content information and permitted device fields require explicit opt-in. Installing the SDK does not automatically publish full page URLs or device metadata. Prohibited IP addresses, precise coordinates, persistent identifiers, and the out-of-scope `user` object remain excluded regardless of opt-in. The SDK/server field allowlist and URL handling must be defined before enabling these optional fields.

## Default auction policy

**Agreed 2026-09-22:** the default server collects bids for a configurable window ending at the existing `closes_at`, then selects the eligible bid with the highest positive expected proceeds after mint redemption fees. Equal-value bids are ordered by first receipt. The first implementation has no early-selection threshold. Bids still undergo the protocol's commitment, sender, size, funding, and remaining-settlement-time checks before they can win. Only bids whose required eligibility checks have completed within the auction budget can win; nonpositive proceeds or no eligible bids produce no-fill.

The selected bidder pays its full bid amount under ROB's existing first-price rule. This ranking policy belongs to the default publisher implementation; other conforming publishers retain their existing freedom to rank bids, break ties, and select early.

`closes_at` retains its existing meaning: bids received at or after it are late. Rendering, authorization, and settlement can follow the collection deadline. This milestone introduces no additional render-expiry field or separate configured settlement-cutoff policy. The bidder's Cashu `locktime` still governs refund eligibility; it is not replaced by `closes_at`, and the existing requirement to account for remaining settlement time still applies. Numeric collection and worker timing defaults are implementation tuning.

**Agreed 2026-09-22:** persist the selected bid before exposing its creative document reference to the browser, and keep that selection fixed afterward. A failed render, missing pixel, failed payment, or server restart does not substitute another bid for that opportunity. A different auction requires a new explicit ad load. This default publisher policy freezes selection earlier than the protocol's permanent oracle-authorization binding. See [ADR-0014](docs/adr/0014-freeze-selection-before-delivery.md).

## Auction payment keys and local funding validation

**Agreed 2026-09-22:** derive a fresh, unique publisher payment keypair for each new auction and publish its compressed public key in `publisher_payment_pubkey`. Derive and durably retain the key or its recovery information before signing and publishing the request. The same signed request retains the same payment key; a new auction uses a new key. This Cashu payment key is separate from the publisher's Nostr identity used for event signing and oracle HTTP authentication.

The publisher requires every proof to carry valid DLEQ data verified against its saved, authenticated mint keysets. It also checks the accepted mint, keyset unit, amounts, commitment, refund conditions, and exact existing 2-of-2 `SIG_ALL` lock to that auction's publisher payment key and the declared oracle payment key. Missing or invalid DLEQ, unavailable saved keys, invalid conditions, or insufficient remaining settlement time make a bid ineligible. Local checks still reject duplicate inputs and proof reuse between independent bids; multiple bids within one auction share its publisher payment key.

The default publisher makes no mint spend-state queries during bid acceptance. Before refund eligibility, genuine correctly locked proofs require the publisher's signature to spend; a fresh auction key and local signing state provide the basis for accepting them without an online state lookup. DLEQ authenticates mint issuance, not a mint's current spend state. Once the bidder's refund path becomes available, a refund can race with settlement regardless of the fresh key. The mint's enforcement and the existing refund rules remain authoritative. See [ADR-0013](docs/adr/0013-auction-keys-and-local-funding-validation.md).

Saved mint-key provisioning, keyset refresh, and fee metadata management are implementation work. Omitting spend-state queries does not remove the actual mint settlement call or permit treating unknown settlement outcomes as success. Included DLEQ data remains part of the original token hash; its private blinding value `r` must not be forwarded to the mint in the swap.

## Creative execution

**Agreed 2026-09-22:** support HTTPS assets and scripts and new-tab advertiser landing pages within the common isolated-iframe profile. Deny access to the publisher page's DOM/storage and navigation of the publisher page. Preserve the selected HTML string, its committed dimensions, and its existing pixel; do not inject policy markup or rewrite links after signing.

The default server stores the exact creative string and serves its UTF-8 bytes as an HTML document with `Content-Type: text/html; charset=utf-8` and `Cache-Control: no-store`. The auction response returns that document's URL and the committed width and height. Fetching the document serves the already selected creative; it never starts an auction or changes the selection. The bidder still supplies complete HTML, so this browser-facing document URL does not introduce URL-only bids.

The SDK uses `sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"`, retaining an opaque origin by omitting `allow-same-origin` and denying top-level navigation. The server also applies a CSP `sandbox` directive with those permissions to the document response, including direct visits, plus response-header policies enforcing HTTPS external resource loads and the configured embedding origins. Inline HTML/CSS/JavaScript remains supported. Exact CSP directives and browser compatibility fixtures are implementation details within these constraints.

Require bidder-authored absolute URLs for external resources so that relative references do not resolve against the publisher's document endpoint. Do not inject a base element, CSP meta tag, nonce, wrapper, or tracking code into the signed HTML. Validation and serving must not prefetch the oracle pixel; the rendered creative's existing pixel drives the intended callback. The original HTML string, not the document URL or rendered DOM, is supplied to the oracle for commitment verification.

Isolation does not promise cookieless network requests, prove viewability, or itself guarantee that every popup follows a user click. Browser resource policies still apply, and advertiser landing navigation has separate browser restrictions from resource loading. See the [HTML sandbox rules](https://html.spec.whatwg.org/multipage/browsers.html#sandboxing) and [CSP response-header delivery](https://www.w3.org/TR/CSP3/#csp-header). Header policies preserve the committed body while avoiding reliance on `srcdoc`'s inherited parent policy.

## Durable payment recovery

**Agreed 2026-09-22:** the standalone Bun server uses durable SQLite state and an in-process settlement worker. It persists the selected bid and the payment material needed for recovery, including the auction payment private key or its derivation information, output secrets, and blinding factors, before requesting oracle authorization. Pending payment work survives a server restart and resumes independently of the browser request.

Recovery follows the existing exact-retry rules: retain the committed token and HTML, use the same authorized input/output signing data, refresh HTTP authentication when necessary, and never replace an already authorized bid or output set. A crash or missing HTTP response does not establish that authorization or settlement failed. Retain and reconcile an ambiguous mint outcome instead of recording a successful payment without evidence or starting a competing spend. Worker retry scheduling and concrete mint recovery operations are implementation work, subject to the existing locktime/refund rules. These server-side recovery operations remain in scope even though browser auction retries do not. [ADR-0012](docs/adr/0012-local-publisher-payment-recovery.md) records the local recovery architecture.

## Existing constraints

- Each v1 bid request offers exactly one impression, with one or more accepted fixed banner sizes. Multiple sizes are alternatives for that opportunity. Separate opportunities require separate bid requests.
- The server validates funding and constructs a valid mint transaction. Oracle authorization does not establish authentic or currently spendable funding.
- The original signed HTML and payment token must be preserved. Incompatible creatives are rejected rather than rewritten or sanitized into a different signed payload.
- The browser requests the embedded oracle pixel in the intended flow. Its observation is a delivery signal, not proof of display or viewability.
- An issued authorization permanently fixes one bid and the ordered swap outputs for the opportunity. Recovery must preserve the corresponding output secrets and blinding factors; settlement failure does not allow a replacement bid or replacement outputs.
- Public bid requests exclude viewer IP addresses, precise coordinates, and persistent device identifiers. The OpenRTB `user` object is outside v1.
- V1 has one common rendering profile with JavaScript in an isolated iframe, HTTPS assets/scripts, and new-tab landing pages, denying access to and navigation of the publisher page. The default renderer implements that profile through a server-served document, response headers, and an iframe sandbox.

These constraints are specified in [FLOW.md](FLOW.md); they are not new decisions introduced by this implementation document.

## MVP validation

**Agreed 2026-09-22:** an isolated proof of the publisher server and SDK is sufficient for this milestone. Completion does not require a live request-to-settlement integration with all other ROB implementations. A full end-to-end integration test will be built once all components are available.

**Agreed 2026-09-22:** exercise the real publisher logic against controlled relay, oracle, and mint counterparts, with a browser exercise for the SDK. The proof covers bid selection, no-fill, a terminal browser request failure without retry, auction-specific payment keys, DLEQ/lock validation without mint spend-state queries, unchanged creative document delivery, browser isolation, missing-pixel authorization retries, settlement, fixed selection after delivery, and restart recovery. Full interoperability with the independently built implementations is deferred to the later end-to-end test.

The controlled counterparts provide isolation, not evidence that live implementations interoperate. Isolated validation changes the evidence required for this milestone; it does not remove auction, authorization, or settlement responsibilities from the publisher design.

## Deliberately deferred details

The publisher architecture and MVP scope are agreed. Implementation may settle local endpoint names, SDK method and response field names, package layout, numeric limits and tuning, key provisioning/derivation mechanics, optional context allowlists, and exact CSP/browser fixtures within the rules above. Shared bid schemas, oracle HTTP details, and other protocol interoperability questions remain explicit work in [NOSTR.md](NOSTR.md#6-next-decisions) and [FLOW.md](FLOW.md#details-still-to-specify); using a proposed shape in an isolated fixture does not make it an accepted wire standard.

Placement metadata and other SDK implementation details remain outside signed ROB payloads unless separately adopted in the protocol. Browser retries/idempotency, automatic refresh, hosted operation for independent publishers, an embeddable server library, and a separate render-expiry policy are outside this MVP. No mint spend-state check is required for bid acceptance. The full end-to-end integration test follows once the participating components are built.
