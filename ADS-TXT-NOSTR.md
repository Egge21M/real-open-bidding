# Optional ads.txt seller authorization

Optional ROB extension agreed 2026-09-22, with research against IAB Tech Lab's ads.txt 1.1 and its reference crawler. Inclusion in the ROB specification and optional bidder enforcement are accepted; exact entry syntax and retrieval/cache rules remain draft. This is not an IAB-standardized variable. The authoritative protocol policy is in [FLOW.md: Optional seller authorization](FLOW.md#optional-seller-authorization).

## Specified optional behavior

A website can publish the Nostr signing keys of publishers authorized to sell its inventory. A bidder MAY check for a declaration matching the original bid-request event's `pubkey` for `site.domain`, and MAY require a verified match as its own participation rule. ROB does not require publishers to publish this extension or bidders to perform the check.

A missing file or key, failed lookup, or unavailable fresh result does not itself invalidate a ROB request or prohibit funding. Such an outcome supplies no affirmative seller authorization; whether to participate anyway is the bidder's decision. Seller authorization adds no settlement, oracle, mint, or refund condition. The existing independent oracle-verification requirement remains mandatory. [ADR-0006](docs/adr/0006-optional-seller-authorization.md) records this distinction.

## Existing extension points

Ads.txt 1.1 accepts `VARIABLE=VALUE` declarations with arbitrary string values and supports repeated variables. Variable names must have no internal whitespace, so underscores fit its syntax. Comments begin with `#` and are ignored. Record extensions follow a semicolon. Normal records identify an advertising-system domain and an account within that system. [IAB ads.txt 1.1, sections 3.3–3.5](https://github.com/InteractiveAdvertisingBureau/Supply-Chain-Validation/blob/main/ads.txt%20v1.1.md#35-variable-declaration-records).

A ROB-specific variable is therefore the recommended carrier. It can list a key directly without inventing an advertising-system operator or pretending a Nostr key is an existing SSP account. The variable name below is illustrative and remains undecided:

```text
ROB_PUBLISHER=<64-lowercase-hex Nostr public key>
ROB_PUBLISHER=<another authorized Nostr public key>
```

The IAB reference crawler strips comments, processes selected domain directives, then skips rows with fewer than three comma-separated fields. An unfamiliar one-field key declaration is consequently skipped rather than treated as an advertising-system record. This is a source inspection, not a guarantee about every deployed parser. Existing crawlers need ROB-specific support to enforce its meaning. [Reference crawler, `crawl_to_db`](https://github.com/InteractiveAdvertisingBureau/adstxtcrawler/blob/master/adstxt_crawler.py).

For files without ordinary seller records, ads.txt specifies a placeholder record. A ROB-only publication needs to address this coexistence rule explicitly. [IAB section 3.2.1](https://github.com/InteractiveAdvertisingBureau/Supply-Chain-Validation/blob/main/ads.txt%20v1.1.md#321-files-without-authorized-advertising-system-records).

## Draft verification procedure

This procedure describes the optional check for a bidder that chooses to use it. It does not make that check a prerequisite for all ROB bids.

1. Validate the original signed ROB bid-request event. Its envelope `pubkey` is the identity to authorize; do not accept a separate publisher-supplied key as a substitute. NIP-01 represents the event creator's public key as 32 bytes of lowercase hex and includes it and `content` in the signed event hash. [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md#events-and-signatures).
2. Read `site.domain` from that authenticated request and resolve its applicable ads.txt using the domain-scope rules ROB still needs to choose.
3. Retrieve the declaration over authenticated HTTPS, or use a previously authenticated copy that is still fresh under the eventual ROB cache policy.
4. Report verified seller authorization only when a trustworthy, sufficiently fresh declaration contains an explicit ROB entry matching that event signer. A missing match or failed verification does not establish authorization. The bidder's participation policy determines whether it still funds a bid.
5. Independently perform the already-required oracle verification. Domain authorization does not authenticate the oracle's payment key or pixel service.

The request signature identifies its author; the website declaration can independently grant that author permission to sell the declared inventory. The declaration refers to the Nostr signing key, allowing the signed request to carry its payment terms; the publisher identity-to-payment-key contract is still a separate open issue.

## Retrieval rules that need an explicit ROB decision

Baseline ads.txt permits HTTP, preferring HTTPS; supports redirects within the original root domain and one outward delegation hop; and uses Public Suffix List root lookup with explicit subdomain overrides. Its missing-file behavior is permissive. It specifies caching, HTTP freshness, and a seven-day default without cache directives. These are existing ads.txt rules, not automatically ROB requirements. [IAB sections 3.1, 3.6, and 5.5](https://iabtechlab.com/wp-content/uploads/2022/04/Ads.txt-1.1.pdf).

Remaining details for the optional extension, to settle before interoperable implementations:

- **Scope:** Recommend the exact declared hostname initially, without implicit parent-domain or wildcard grants. This is easier to explain but deliberately differs from ordinary ads.txt lookup. Reusing its root/subdomain resolution instead would fit existing deployments, at the cost of defining inheritance and override semantics for ROB entries.
- **Transport:** Recommend HTTPS with certificate validation and no HTTP downgrade for authenticated verification. If delegated hosting is supported, specify the permitted authenticated redirect chain rather than accepting any final destination.
- **Failure and freshness:** Define when a cached declaration is sufficient for a positive verification result and how lookup errors are represented. Whether a missing or failed result prevents participation remains bidder-local. This note proposes no numeric ROB lifetime.
- **Rotation/removal:** Allow multiple authorized keys for overlapping rotation. Define how removal affects subsequent verification results and cache freshness; participation decisions remain bidder-local. A cached entry cannot provide instantaneous revocation, and changing ads.txt cannot erase existing Cashu spending conditions.
- **Parsing:** Set the variable name, key encoding, duplicate handling, malformed-entry behavior, domain normalization, and interaction with ads.txt delegation variables. Do not infer ROB permissions from unrelated `OWNERDOMAIN`, `MANAGERDOMAIN`, or inventory-partner declarations without an explicit rule.

## Security boundary

For bidders that require verified seller authorization, the check would prevent an unrelated Nostr key from merely claiming another website's domain and passing that check. It would not prove that a particular visitor, slot, or rendered impression exists. An authorized publisher can still misdescribe inventory or trigger its own oracle pixel, as already discussed in [FLOW.md](FLOW.md#trust-model-and-poc-limits). Domain hosting and authorized signing-key compromise remain within the trust model. The useful claim is permission to offer inventory, not proof of delivery; bidders that do not enforce the check do not gain its domain-authorization assurance.
