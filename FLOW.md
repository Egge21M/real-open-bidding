# Real Open Bidding: protocol flow

Status: POC specification draft. This document records the agreed flow; wire formats and the [open questions](#details-still-to-specify) remain to be defined.

**Real Open Bidding (ROB) is a fully open, prepaid, decentralised, trust-minimised real-time bidding protocol built on Nostr and Cashu ecash.**

A publisher announces an ad opportunity and its accepted Cashu mints on Nostr. Each bidder responds with a creative and locked ecash from one accepted mint. The publisher selects and renders a bid, obtains its declared oracle's payment authorization, and claims the ecash at that bid's issuing mint. Unspent bids have a bidder-chosen refund deadline.

**V1 supports HTML banners on websites only.** Bidders submit the complete HTML markup as a string, with the oracle pixel already included. The [creative scope](#v1-creative-scope) defines this boundary; the broader OpenRTB and Prebid references do not expand v1's supported formats or inventory.

The POC uses a pixel callback as its delivery signal. It does **not** prove rendering or viewability; the [trust model](#trust-model-and-poc-limits) explains this limitation. [OPENRTB.md](OPENRTB.md) provides the reference message model, with ROB-specific additions still to be encoded.

## Participants

| Participant | Responsibility |
| --- | --- |
| Publisher | Announces opportunities, chooses accepted mints and the oracle, runs the auction, renders the winner, and claims payment. |
| Bidder | Evaluates opportunities, supplies the creative and funded bid, chooses the refund deadline, and recovers unspent funds. |
| Nostr relays | Distribute requests to subscribing bidders. |
| Render oracle | Checks the bidder's commitment and pixel callback before authorizing payment. |
| Cashu mint | Issues ecash and enforces spending conditions for settlement and refunds. |

## Overall sequence

```mermaid
sequenceDiagram
    participant P as Publisher
    participant N as Nostr relays
    participant B as Bidder
    participant V as Viewer browser
    participant O as Render oracle
    participant M as Cashu mint

    B->>N: Subscribe to bid requests
    P->>N: Publish opportunity, accepted mints, keys, and pixel base URL
    N-->>B: Deliver request
    B->>B: Independently verify the trusted oracle's identity, payment key, and pixel endpoint
    B->>B: Choose an accepted mint; prepare locked ecash with refund deadline
    B->>B: Insert pixel, then sign commitment with fresh refund key
    B->>P: Creative, amount, locked ecash, and commitment
    Note over B,P: Multiple bidders can respond
    P->>P: Validate bids and select winner
    P->>V: Render winning creative unchanged
    V->>O: Request embedded pixel URL
    O->>O: Record callback for the bid
    P->>O: NIP-98-authenticated authorization request with creative, ecash, commitment, outputs, and context
    O->>O: Authenticate publisher; check commitment, payment, pixel URL, callback, and authorization eligibility
    alt All checks pass
        O->>O: Persist commitment, original proofs, ordered outputs, and signature, or reuse exact authorization
        O-->>P: Return oracle Cashu signature
        P->>P: Add publisher signature to the same spend
        P->>M: Submit completed spend before refund eligibility
        M-->>P: Settle valid spend, deducting redemption fees
    else A check fails or callback is absent
        O-->>P: No payment signature
    end
    opt Any bid has unspent proofs after its locktime expires
        B->>M: Submit refund spend
        M-->>B: Complete valid refund if proofs remain unspent
    end
```

The bid arrow is a logical message carried through Nostr relays using NIP-59 ephemeral gift wrapping: a `28301` bid rumor inside a `13` seal and a published `21059` wrap. The oracle MVP uses HTTPS with NIP-98 publisher authentication for authorization requests; the remaining API details are open. The bidder obtains and prepares funding before submitting its response. Callback and authorization-request arrival may occur in either order.

## 1. Publisher publishes a bid request

The publisher describes a website HTML banner opportunity in an OpenRTB-like request and publishes it through Nostr relays. In addition to the advertising information, the request contains:

- The publisher's payment public key, `publisher_payment_pubkey`.
- The bid collection deadline, `closes_at`, as an upper bound on timely receipt; the publisher may select earlier.
- A nonempty `mints` array of Cashu mint URLs accepted by the publisher.
- The chosen oracle's Nostr identity and payment public key, `oracle.pubkey` and `oracle.payment_pubkey`.
- The oracle's pixel base URL, `oracle.pixel_base`.
- The opportunity's `impression_id`.
- A nonempty `banner_sizes` list of accepted width/height pairs for that opportunity, as specified under [banner sizing](#banner-sizing).

**Agreed 2026-09-21:** a v1 bid request offers exactly one impression and retains its `impression_id`. A header banner and a sidebar banner require separate bid requests; one request cannot offer both opportunities.

The publisher discloses its accepted mints and oracle before bidders commit funds. Each bidder chooses one listed mint. The refund deadline is chosen by each bidder, not assigned by the request. Auction requests use experimental ephemeral kind `28300` with JSON in `content`; the agreed [minimum signed request schema](NOSTR.md#minimum-signed-request-content) uses integer `version: 1` and groups all oracle data under `oracle`. Remaining transport details and discovery rules are open. [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) supplies the underlying publication/subscription mechanism.

**Agreed 2026-09-21:** `bid_request_id` is the stable identifier of the auction's exact published bid request: the `id` of its signed Nostr `28300` event. It is read from the event envelope and is not embedded in that request's own content. Retransmitting the same event preserves `bid_request_id`; changing the signed event contents creates a new ID and is treated as a new auction. Bids, pixel callbacks, commitments, and payment authorizations use `bid_request_id` to refer to that original request. The pair `(bid_request_id, impression_id)` identifies one offered ad opportunity.

### Advertising context

**Agreed 2026-09-22:** v1 reuses OpenRTB's `site` and `device` objects for advertising context. Preserve their standard field names, types, meanings, and referenced nested object definitions from the repository's OpenRTB 2.6-202606 reference. `site` describes the website, publisher, page, and content; `device` describes the viewer's device and browser environment. The OpenRTB `user` object is outside v1. See [ADR-0005](docs/adr/0005-reuse-site-and-device-context.md).

**Agreed 2026-09-22:** every bid request MUST contain `site` with a nonempty `site.domain` string identifying the website. `device` is optional; omitting it does not make a request invalid. No other site or device field is required by this decision. Domain syntax and normalization remain to be specified. Bidders may apply the optional seller-authorization check below.

Public requests MUST exclude viewer IP addresses, precise geographic coordinates, and persistent device identifiers. In the standard device object, this excludes:

- `device.ip` and `device.ipv6`.
- `device.geo.lat` and `device.geo.lon`.
- `device.ifa` and the deprecated identifier fields `didsha1`, `didmd5`, `dpidsha1`, `dpidmd5`, `macsha1`, and `macmd5` under `device`.

Browser, language, screen, and capability information remain available through their standard fields. Excluded device data must not be reintroduced through extension objects or renamed fields. A request containing prohibited data is invalid; a receiver must not silently remove it and treat the modified content as the same signed request. The remaining extension, unknown-field, and deprecated-field rules are still part of the wire-schema work. These exclusions do not establish that combinations of the remaining metadata are anonymous.

The supplied context is publisher-declared. `device.w` and `device.h` retain their OpenRTB meaning as physical screen dimensions; the [accepted banner sizes](#banner-sizing) are separate creative dimensions in CSS pixels. ROB's event identity, deadline, oracle, and payment requirements continue to define those parts of the request. [OpenRTB Site](https://github.com/InteractiveAdvertisingBureau/openrtb2.x/blob/2.6-202606/2.6.md#objectsite), [Device](https://github.com/InteractiveAdvertisingBureau/openrtb2.x/blob/2.6-202606/2.6.md#objectdevice).

## 2. Bidders evaluate the opportunity

Bidders subscribe to requests and evaluate the opportunity, publisher, accepted mints, and oracle before deciding whether to participate. The publisher need not contact every bidder individually, and subscribing does not commit a bidder to an offer.

### Optional seller authorization

**Agreed 2026-09-22:** ROB includes an [ads.txt extension for seller authorization](ADS-TXT-NOSTR.md). A website can list the publisher Nostr signing keys authorized to sell its inventory. The identity being checked is the `pubkey` of the original signed bid-request event for the declared `site.domain`.

Bidders MAY use this declaration as a participation check before funding. Publication of the extension and enforcement of the check are optional: a missing file, absent key, failed lookup, or unavailable fresh authorization does not by itself invalidate a ROB request or prohibit a bid. Each bidder chooses whether those outcomes cause it to decline. Absence of a verified listing is not affirmative seller authorization, even when a bidder elects to participate.

Seller authorization adds no oracle, mint, settlement, or refund condition. It establishes permission to offer inventory, not proof that an impression was rendered. The extension's exact entry syntax, domain scope, authenticated retrieval, and caching rules remain draft details. See [ADR-0006](docs/adr/0006-optional-seller-authorization.md).

### Required oracle verification

**Agreed 2026-09-21:** before locking funds for a bid, the bidder MUST independently verify that the declared oracle identity, payment public key, and pixel base URL belong together and identify an oracle it trusts. The publisher's signed request alone is insufficient evidence: a publisher could declare its own second key as the oracle's and satisfy both payment signatures. If the bidder cannot establish a trusted oracle identity binding, it must not fund or submit the bid. See [ADR-0004](docs/adr/0004-verify-oracle-before-funding.md).

The bidder chooses how to establish this trusted binding. Trusted local configuration can satisfy the requirement; v1 does not prescribe a common oracle attestation or discovery protocol. Updating a key or endpoint must preserve the independently verified binding; a new publisher declaration alone does not establish trust in the replacement.

## 3. Bidder sends a prepaid response

The bidder prepares ecash under the [payment conditions](#payment-conditions) with a fresh refund key for this bid, inserts the [oracle pixel](#pixel-url) into its creative, then uses that refund private key to sign a [commitment](#creativepayment-commitment) covering the completed creative's hash, the exact token, its Nostr identity, and the bid context. The commitment uses BIP-340 Schnorr; the Nostr identity key signs the transport seal.

The response includes the creative, its single chosen width-and-height pair, the gross bid amount in sats per impression, a `payment` string containing a Cashu V4 token (`cashuB…`) with exactly matching locked ecash, and the signed commitment. The token identifies the bidder's selected mint, which must be accepted by the request's `mints`; proofs from multiple mints cannot be combined in one bid. The original token contains no spending witnesses and is preserved unchanged for commitment verification. Funding is supplied before rendering, but the publisher cannot claim it alone. The bidder retains the token, proofs, and refund private key for recovery.

**Agreed 2026-09-21:** a bidder may submit multiple independent, immutable bids for the same `(bid_request_id, impression_id)`. Each new offer has a fresh `bid_nonce`, a fresh refund key, and separate funding; proofs cannot be reused between independent bids. A later offer does not replace or withdraw an earlier one, and both may be considered if otherwise eligible. Retransmitting an existing bid preserves its original offer, token, refund key, nonce, and commitment. V1 defines no bid amendment or withdrawal operation. See [ADR-0002](docs/adr/0002-independent-immutable-bids.md) for the rationale.

## 4. Publisher runs the auction

The publisher validates bids and selects a winner locally. It checks the mint, `sat` keysets, proof total, locking keys, refund conditions, and remaining settlement time. It verifies the commitment against the refund key extracted from the proofs and checks that the signed bidder identity matches the authenticated Nostr sender. It accounts for redemption costs and may reject bids with insufficient time under its own acceptance policy. Deadlines can differ between bids in the same auction.

It also requires an explicit [bid creative size](#banner-sizing) matching one of the request's accepted banner sizes and covered by the commitment. Missing, invalid, or unlisted dimensions make the bid ineligible.

ROB always uses first-price pricing: the winner pays its full bid amount before redemption fees. The request carries no auction-type field. **Agreed 2026-09-21:** ranking and tie-breaking among eligible bids are publisher-defined. ROB does not require choosing the highest gross bid or prescribe a common scoring formula; a publisher may account for net proceeds after redemption fees and creative preferences. First-price fixes the selected bidder's payment amount.

The request's bid collection deadline, `closes_at`, is an absolute Unix timestamp in seconds; bids received by the publisher at or after that time are late. **Agreed 2026-09-21:** this is an upper bound, not a promise that the publisher will consider bids until that instant. The publisher may select early and proceed through rendering, oracle authorization, and settlement before `closes_at`, subject to all existing payment checks. Its collection, stopping, and handling of unused bids are implementation details. Winning alone does not unlock payment. See [ADR-0003](docs/adr/0003-publisher-controlled-early-selection.md).

V1 sends no ROB receipt, outcome, or rejection messages to bidders, including no indication that a bid was unused because of timeout or early closure. There is no early-closure announcement. A bidder cannot infer consideration or selection from submission before `closes_at` or from relay acceptance; it retains its funding for recovery under the existing refund rules.

## 5. Publisher renders the winning creative

The publisher renders the winning HTML banner payload unchanged, including the bidder-inserted pixel. It does not inject tracking code or substitute placeholders after signing.

In the intended flow, the viewer's browser requests the pixel over HTTP. The oracle records the callback by `bid_request_id`, `impression_id`, and `bid_nonce`. It can record callbacks before receiving the authorization request and match them later; no bidder registration or extra publisher-to-oracle coordination message is required.

**Agreed 2026-09-22:** the oracle MVP durably persists recorded callbacks without automatic expiry. The observation survives restarts and remains eligible as callback evidence for a later first authorization; elapsed time alone does not discard it. All other authorization checks still apply. Callback cleanup is deferred to a future policy decision, which must preserve the permanent binding of every already authorized opportunity.

## 6. Publisher requests oracle authorization

The publisher submits:

- The exact original `payment` token string and commitment signed with the bid's refund key.
- The original creative payload for hashing.
- The proposed swap outputs; the oracle derives the spending inputs from the original committed token.
- The original request and bid context, including the signed bidder Nostr public key, needed to verify the commitment and check the pixel URL.

**Agreed 2026-09-22:** the authorization payload carries the full bidder commitment, including `bidder_pubkey`, `creative_hash`, `payment_hash`, and `sig`. It omits `amount_sat`: the oracle derives the gross authorized amount by summing the decoded proofs in the original committed `payment` token. The publisher remains responsible for rejecting a bid whose declared amount differs from that total. This changes the publisher-to-oracle payload, not the bidder-to-publisher amount requirement. See [NOSTR.md: Oracle authorization payload](NOSTR.md#5-oracle-authorization-payload).

**Agreed 2026-09-22:** the oracle derives all swap inputs directly from the committed token, preserving encoded order: traverse the V4 token's keyset groups in array order, then each group's proofs in array order. Do not sort, regroup, or silently deduplicate the inputs; reject duplicate inputs. The publisher must use the same input order when signing and submitting the swap. No duplicate input-proof array is included in the authorization payload.

**Agreed 2026-09-22:** the authorization endpoint requires [NIP-98](https://github.com/nostr-protocol/nips/blob/master/98.md) authentication by the publisher's Nostr identity. The oracle validates the original signed bid-request event and requires the authentication event's signer to match that request's `pubkey`. ROB requires the NIP-98 payload hash and verifies it against the exact authorization request body, binding the publisher's approval to the submitted commitment, creative, payment, context, and swap outputs. Verify the signed authentication event, URL, HTTP method, body hash, and timestamp freshness before creating an authorization binding or releasing a payment signature. Missing or invalid authentication cannot assign the impression. The pixel endpoint remains public. See [ADR-0008](docs/adr/0008-nip98-oracle-authorization.md) and [NOSTR.md: Oracle HTTP authentication](NOSTR.md#oracle-http-authentication).

The oracle:

1. Decodes the token and checks its structure, declared mint and unit, proof amounts, and required payment conditions. Requires the same single refund public key in every proof and derives the commitment verification key from it. A key supplied separately by the publisher is not a substitute. Mint-dependent funding validation belongs to the publisher under the MVP boundary below.
2. Hashes the exact original token string with SHA-256 over its UTF-8 bytes and compares the lowercase hex result with the signed `payment_hash`, without re-encoding the token for hashing.
3. Hashes the submitted creative, reconstructs the bid context including the bid creative size, and verifies the BIP-340 commitment signature using the extracted refund key. Requires the declared dimensions to match an accepted size in the original signed request. The signed Nostr public key is part of the message, not the verification key. The commitment establishes authorization by the refund-key holder; it does not by itself prove that the named Nostr identity sent the bid.
4. Derives the swap's complete ordered input set from the committed token, rejecting duplicate inputs and permitting no substituted, omitted, or additional inputs. The publisher must use exactly those inputs at the committed mint when completing the spend.
5. Checks the embedded pixel URL against the declared base URL, `bid_request_id`, `impression_id`, and signed `bid_nonce`.
6. Finds a recorded callback matching that URL.
7. Enforces the single-bid authorization rule below for `(bid_request_id, impression_id)`.

Only after all checks pass does the oracle sign the proposed swap. **Agreed 2026-09-22:** a successful response contains only the oracle's Cashu spending signature, as `{ "signature": "<hex>" }`. A callback for one bid must not authorize another bid or payment, and repeated callbacks are not additional payable impressions. An absent callback prevents authorization even if the creative was displayed. Transaction signing and publisher witness assembly are described under [SIG_ALL settlement](#sig_all-settlement).

**Agreed 2026-09-22:** before an authorization has been issued, an otherwise valid request without a recorded matching callback returns an immediate, retryable `pixel_not_observed` result. The oracle does not hold the request open or reserve the impression; the publisher can retry after the callback arrives. The exact HTTP status and error-envelope schema remain open. An exact retry of an already issued authorization follows the existing rule below.

### Oracle MVP validation boundary

**Agreed 2026-09-22:** the oracle MVP performs local authorization checks on the supplied request, creative, commitment, token, payment conditions, and proposed swap transaction, and requires a matching pixel callback. It does not contact the mint. The publisher is responsible for validating mint-signature authenticity, the unit associated with the proofs' keysets, and spendability, as well as constructing and submitting the settlement transaction. See [ADR-0007](docs/adr/0007-oracle-local-authorization.md).

**Agreed 2026-09-22:** payment validity, including validity of the publisher's proposed swap outputs, belongs to the publisher. The publisher checks output points, duplicate outputs, supported amounts and denominations, input/output balance, fees, and the mint's acceptance requirements. The oracle does not repeat those wallet checks. It parses the output signing data according to the API's field types and encoding rules, constructs the deterministic `SIG_ALL` message, and enforces the existing commitment, callback, authentication, and authorization-exclusivity rules. API parsing and serialization do not certify that the mint will accept the payment.

The oracle checks that the token declares `sat`, that its mint is accepted by the original request, and that its decoded proof amounts yield a valid positive integer gross amount. It derives that amount directly from the token; there is no separate declared amount in the authorization payload. Those local checks do not authenticate the mint's signatures or the declared keyset units. The MVP does not require oracle-side DLEQ verification or provisioned mint keys. Payment authorization therefore does not certify genuine or currently spendable ecash; the publisher's funding checks and the mint's enforcement remain necessary. The existing one-authorized-bid rule still applies.

Mint-authenticated keyset-ID resolution also belongs to the publisher. The oracle derives the input signing material directly from the token; keyset IDs are not part of the `SIG_ALL` signing message. The publisher resolves any abbreviated IDs when constructing the mint transaction, preserving the committed proofs and their agreed input order without introducing a mint lookup in the oracle.

The oracle exposes an HTTPS authorization endpoint protected by NIP-98 alongside its public pixel endpoint. The publisher supplies the evidence needed for local verification; a Nostr relay subscription is not required by the oracle. NIP-98 freshness and reuse follow the [agreed HTTP authentication profile](NOSTR.md#oracle-http-authentication); remaining wire-schema details and public endpoint URL handling are still open. NIP-98 authenticates the caller; authentication of the configured oracle service and its declared identity/payment key remains a separate concern.

### One authorized bid per impression

**Agreed 2026-09-21:** for each `(bid_request_id, impression_id)`, the oracle MUST authorize payment for at most one bid commitment. After the other checks pass, it atomically and durably binds that opportunity to the commitment and its original payment proofs before releasing a signature. Concurrent requests cannot authorize different bids for the same opportunity, and the binding survives oracle restarts. A callback alone, an invalid authorization request, or a request without a matching callback does not assign the opportunity.

An exact authorization retry returns the existing authorization. Retries remain bound to the same commitment and original payment proofs; authorizing a different bid is forbidden once authorization has been issued. Settlement failure, a timeout, or refund eligibility does not release this binding. V1 allows no switch to another bid after the oracle signs.

**Agreed 2026-09-22:** the binding also fixes the ordered output signing data of the authorized swap. Once a signature is issued, reject any request to change output amounts, blinded messages, or their order, including for the same bid and original proofs. Persist the ordered outputs and the exact signature with the opportunity's durable authorization record before releasing the response; exact retries return that stored signature across restarts. Refreshing NIP-98 authentication does not create a new payment authorization. The publisher must retain its chosen output secrets and blinding factors because it cannot recover from their loss by requesting authorization for replacement outputs. Authorization bindings remain permanent; storage implementation and any future callback cleanup must preserve this rule and exact retries. See [ADR-0009](docs/adr/0009-fixed-authorized-swap-outputs.md).

The publisher still selects the winner. This rule limits authorization for one declared opportunity; it does not verify auction fairness or establish whether multiple declared opportunities refer to the same physical placement.

## 7. Publisher completes settlement

The publisher reconstructs the same ordered swap, verifies the returned oracle signature against the declared oracle payment key, and signs the same Cashu message with its own payment key. It places both spending signatures in the first input's `witness` and submits the completed swap to the issuing mint. Payment completes when the mint processes the spend, not when signatures are collected. The publisher bears redemption fees under the [amount rules](#amount-and-redemption-fees).

To avoid competition from a refund, settlement must complete before locktime expiry. Signatures do not reserve funds or extend the deadline. The publisher chooses its settlement schedule and safety margin; ROB fixes neither.

## 8. Bidder recovers unspent funds

After the mint considers a bid's locktime expired, the bidder can sign a refund spend with its refund key and submit its retained proofs. No publisher or oracle signature is needed. This covers losing, rejected, failed, and abandoned bids, including bids unused because of timeout or early closure and unsettled winning bids. Recovery does not depend on a bidder receiving a rejection or outcome message. Losing an auction does not enable an earlier refund, and expiry does not automatically transfer funds.

The original publisher/oracle path remains valid after expiry. A late settlement and refund can race; successful mint processing determines which spend completes. Consumed proofs cannot subsequently fund the other path. Mint outages can delay recovery. [NUT-11: Refund MultiSig](https://github.com/cashubtc/nuts/blob/main/11.md#refund-multisig).

## Message size limits

**Agreed 2026-09-22:** v1 defines common maximum sizes for bid requests and bids. A publisher may advertise a smaller maximum accepted bid size in its request; it cannot raise the protocol maximum. The numeric budgets, fields, and exact byte-counting boundaries remain to be defined after accounting for the payment token, serialization, and encryption overhead. See [NOSTR.md: Payload size limits](NOSTR.md#payload-size-limits).

## Payment conditions

### Amount and redemption fees

The POC uses **`sat` only**. A bid amount is a positive integer expressing the face value offered for **one impression**, before redemption fees. Fractional sats, `msat`, and other units are excluded.

All attached proofs must come from the `sat` keysets of the single accepted mint selected by the bidder, with:

```text
bid_amount_sat = sum(attached_proof.amount)
```

A wrong mint, wrong unit, or amount mismatch invalidates the bid. The publisher validates the unit against the keysets; a token's stated unit alone is insufficient. The oracle MVP checks the declared unit locally, as described in its [validation boundary](#oracle-mvp-validation-boundary). [NUT-00: Proof](https://github.com/cashubtc/nuts/blob/main/00.md#proof), [NUT-01: Currency Units](https://github.com/cashubtc/nuts/blob/main/01.md#supported-currency-units).

The publisher chooses which mints to accept and absorbs winning-payment redemption fees at the bidder-selected mint. Fees may differ between accepted mints. For example, 10 sats of attached ecash with a 1-sat redemption fee yield 9 sats for the publisher; the bidder supplies no top-up. These numbers are illustrative.

OpenRTB's `Bid.price` means CPM and must not silently acquire ROB's per-impression meaning. The ROB amount field name and encoding remain open. [OpenRTB reference](OPENRTB.md).

### Lock and refund path

The publisher payment path is **2-of-2 P2PK with `SIG_ALL`**: both publisher and oracle must sign. A separate refund path requires one bidder signature after a bidder-chosen absolute Unix `locktime`.

ROB sets no fixed, default, minimum, or maximum lock duration. The bidder balances liquidity against settlement time and publisher acceptance. All proofs funding a bid use the same deadline and refund condition, covered by the creative/payment commitment; no separate deadline negotiation is required.

The bidder generates a fresh refund key for each logical bid, separate from its Nostr identity key. Every proof in that bid must contain the same single `refund` public key and `n_sigs_refund` of `1`. The bidder also uses this private key for the commitment signature. Retransmitting the same logical bid retains its original token, key, and commitment.

This illustrative NUT-10 secret is not a complete token or ROB message. Angle-bracket values are placeholders:

```json
[
  "P2PK",
  {
    "nonce": "<fresh-random-nonce>",
    "data": "<publisher-compressed-public-key>",
    "tags": [
      ["pubkeys", "<oracle-compressed-public-key>"],
      ["n_sigs", "2"],
      ["sigflag", "SIG_ALL"],
      ["locktime", "<bidder-chosen-unix-timestamp>"],
      ["refund", "<bidder-refund-compressed-public-key>"],
      ["n_sigs_refund", "1"]
    ]
  }
]
```

`data` and `pubkeys` supply the publisher and oracle's two distinct payment keys. Cashu requires compressed public keys. The commitment verifier derives a BIP-340 x-only key from the refund public key as described below; it does not map the bidder's Nostr identity to a Cashu key. The bidder must verify the [oracle identity binding before funding](#2-bidders-evaluate-the-opportunity) using its chosen verification mechanism; publisher identity-to-payment-key binding remains open. The condition is serialized inside `Proof.secret` before mint issuance, not added by editing an issued proof. [NUT-11](https://github.com/cashubtc/nuts/blob/main/11.md), [NUT-10](https://github.com/cashubtc/nuts/blob/main/10.md).

The `refund` key is required: NUT-11 expiry without refund keys makes proofs anyone-can-spend. With it, expiry enables the alternative refund path and retains the original payment path. The mint's clock determines expiry. [NUT-11: Locktime Tag](https://github.com/cashubtc/nuts/blob/main/11.md#locktime-tag).

### SIG_ALL settlement

**Agreed 2026-09-22:** Cashu's NUT-00 and NUT-11 define the spending-signature representations and construction. ROB adopts those rules directly and adds no separate canonicalization profile for `C`, `B_`, amount text, or the Cashu signature. Implementations must use compatible Cashu serialization and signing behavior and verify it against the upstream vectors. This does not change ROB's separately defined creative/payment commitment encoding.

Each party produces one ordinary Schnorr spending signature over the same transaction-wide Cashu digest. This is not a signature per proof, a signature per output, or a threshold-signature share. For a swap, concatenate each input's original decoded `secret` string and its `C` hex string, followed by each output's amount string and `B_` hex string, preserving their respective orders. Hash that concatenated message with SHA-256 and sign the resulting digest according to NUT-11. Do not concatenate decoded curve-point bytes, add separators, hash a reserialized transaction JSON object, or use ROB's commitment domain tag for this Cashu signature. [NUT-11: Signature scheme](https://github.com/cashubtc/nuts/blob/main/11.md#signature-scheme), [swap aggregation](https://github.com/cashubtc/nuts/blob/main/11.md#aggregation-for-swap).

All inputs must have the same parsed spending-condition kind, locking `data`, and `tags`, including `SIG_ALL`; their nonces and original secret strings may differ. Reject mixed conditions, duplicate supported spending-condition tags, invalid thresholds, and duplicate keys within a spending pathway, comparing key identity as required by NUT-11. A signature that verifies mathematically does not replace these condition checks. The input amount and input/output keyset IDs are not fields in the Cashu `SIG_ALL` signing message; ROB's separate token commitment and publisher funding checks still apply. [NUT-11](https://github.com/cashubtc/nuts/blob/main/11.md#signature-flag-sig_all).

For ROB's 2-of-2 payment path, the first input's `witness` contains both the oracle and publisher signatures as a serialized JSON string. The publisher constructs it on the separate swap transaction, leaving the committed token unchanged:

```ts
inputs[0].witness = JSON.stringify({
  signatures: [oracleSignature, publisherSignature],
});
```

All payment signatures belong in that first witness; do not distribute one signature to each input or attach signatures to the outputs. The returned oracle signature alone is not the complete witness and cannot satisfy the 2-of-2 payment path. It is separate from the bidder's refund-key commitment signature and the publisher's NIP-98 authentication signature. [NUT-11: Witness format](https://github.com/cashubtc/nuts/blob/main/11.md#witness-format).

**Agreed 2026-09-22:** the oracle MVP authorizes swaps only; melt authorization is outside this milestone. A swap turns the jointly authorized inputs into fresh proofs under publisher control. The publisher prepares blinded outputs accounting for the redemption fees and includes their signing data in the oracle request, in the intended final order. Any output sorting must happen before obtaining the oracle signature. The publisher supplies the resolved input/output keyset IDs when constructing the mint request. The oracle signs without submitting the transaction to the mint; the mint consumes valid inputs and returns issuance signatures on the outputs after the publisher submits the completed spend. Those mint issuance signatures are distinct from the two spending signatures in the input witness. [NUT-03](https://github.com/cashubtc/nuts/blob/main/03.md).

API payload limits remain to be specified; Cashu signing representations follow NUT-00 and NUT-11. Output payment-validity checks belong to the publisher. The accepted retry rule fixes the original ordered outputs and returns the stored signature. The Cashu review and proposed conformance fixtures are in [CASHU-SIG-ALL.md](CASHU-SIG-ALL.md).

## Creative and verification

### V1 creative scope

**Agreed 2026-09-16:** v1 supports HTML banner creatives only. The bid supplies the complete HTML markup as a string, including the completed oracle pixel URL, before the refund-key commitment is signed. In the proposed bid schema this is `creative.type: "html"` and `creative.content: <HTML string>`; `html` is the only supported v1 creative type and the fourth element of the commitment context.

**Agreed 2026-09-21:** requests describe website inventory only; in-app inventory is outside v1 even when an app can display HTML. Publishers reject bids for other media types or payload formats. Native asset objects, VAST/video/audio creatives, URL-only creative responses such as `adUrl`, and separate custom-renderer payloads are outside v1. An HTML banner may reference external images; supplying a URL instead of the required HTML body does not satisfy this format. The existing commitment boundary for bidder-hosted assets still applies.

The bidder completes the markup and inserts the pixel before signing. The publisher does not substitute macros, add tracking markup, or modify the submitted HTML after signing. Integrations that prepare or transform markup must finish that work before the bidder commits to it.

The common rendering profile's capabilities and isolation rules, additional compatibility fields, and numeric markup/message limits remain to be specified. V1 offers exactly one impression per bid request. The minimum request and oracle authorization fields are defined in [NOSTR.md](NOSTR.md); remaining bid transport details are still part of the wire-schema work. The [HTML creative hash](#html-creative-hash) is defined below.

### Rendering profile

**Agreed 2026-09-22:** v1 defines one common rendering profile so bidders can rely on shared creative support. V1 does not select different HTML/CSS/JavaScript capability profiles per bid request. The supported features and execution constraints, including whether JavaScript is allowed and the required isolation behavior, remain to be agreed; the renderer implementation is local to the publisher.

The profile must preserve the existing exact-HTML commitment: a publisher rejects an incompatible creative rather than rewriting or sanitizing the signed markup into a different payload. Accepting the common-profile approach does not yet choose specific browser sandbox flags or APIs.

### Banner sizing

**Agreed 2026-09-21:** a bid request declares a nonempty list of accepted banner sizes. Each size is an exact pair of positive integer width and height values in CSS pixels. For example, accepting 300 × 250 and 300 × 600 offers two alternatives for the same impression, not two impressions.

Every bid explicitly declares exactly one of those pairs, even when the request offers only one size. The chosen width and height are covered by the refund-key commitment through the [bid context](#commitment-digest-and-signature). The publisher and oracle reject missing, invalid, or unlisted dimensions; changing the chosen pair invalidates an unchanged commitment. The exact original HTML hash remains defined over the HTML string alone.

The publisher may determine its accepted sizes from its page layout before publishing the request. Changing that signed list creates a new bid request under the existing identifier rule. Fluid and aspect-ratio sizing are outside v1. Checking declared dimensions does not establish that arbitrary HTML actually fits its slot or was displayed; renderer behavior remains to be specified. The agreed request field is `banner_sizes`, containing `{ width, height }` pairs. Both requested and chosen dimensions are positive safe integers (`1..9007199254740991`). The oracle authorization payload uses `creative.width` and `creative.height`. [Prebid size research](PREBID-SIZES.md) informed this decision without adopting Prebid's permissive core size validation.

### Pixel URL

The bidder inserts the pixel **when creating the bid, before hashing and signing**. A reusable template may have a placeholder, but the submitted creative contains the completed URL:

```text
{oracle.pixel_base}/{bid_request_id}/{impression_id}/{bid_nonce}
```

The request content supplies `oracle.pixel_base` and `impression_id`; its signed event envelope supplies `bid_request_id`. The base URL has no trailing slash, query string, or fragment. Append the three identifiers as literal path segments in the displayed order; their agreed alphabets require no percent-encoding. See [NOSTR.md: Identifier formats](NOSTR.md#identifier-formats).

**Agreed 2026-09-22:** `impression_id` is a case-sensitive publisher-chosen string of 1–64 ASCII letters, digits, underscores, or hyphens. The bidder generates `bid_nonce` from 16 fresh random bytes per independent bid, represented as 32 lowercase hexadecimal characters. It is separate from the Cashu proof nonce and is not secret. Retransmitting the same bid preserves its nonce; a new independent bid requires a new one.

```html
<img src="https://oracle.example/pixel/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef/imp-1/00112233445566778899aabbccddeeff" width="1" height="1" alt="">
```

The full URL is covered by the creative hash. The POC uses this single convention; method negotiation and verification profiles are outside its scope.

### Creative/payment commitment

**Agreed 2026-09-16:** one commitment is signed with the bid's fresh refund private key using **BIP-340 Schnorr over secp256k1**. The bidder's Nostr public key is signed data. No additional standalone commitment signature from the Nostr identity key or authorization in the token memo is required.

#### Signing key and authorization

The verification key comes from the `refund` condition in the committed proofs. Every proof must carry the same single refund key and the required ROB payment conditions. Parse and validate that 33-byte compressed secp256k1 public key, then use its 32-byte x-coordinate for BIP-340 verification. NUT-11 compares key identity by x-coordinate, ignoring the `02`/`03` parity prefix. Preserve the original secret strings and token; key comparison does not permit rewriting them. [NUT-11: Public Key Canonicalisation](https://github.com/cashubtc/nuts/blob/main/11.md#public-key-canonicalisation), [BIP-340](https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki).

This authenticates the refund-key holder's approval of the creative, payment, named bidder identity, and bid context. The publisher cannot authorize a replacement creative merely by supplying another identity key and signing a replacement commitment: verification still requires the refund key embedded in the proofs. Changing that embedded key invalidates the mint's proof. A valid commitment signature does not replace the publisher's validation of the proofs' genuineness and spend state, or either party's checks of the required payment conditions. The oracle MVP's [local validation boundary](#oracle-mvp-validation-boundary) does not certify funding authenticity or spendability.

#### HTML creative hash

**Agreed 2026-09-17:** hash the exact completed HTML string, including the inserted oracle pixel, after decoding the bid JSON:

```text
creativeHashBytes = SHA256(UTF8(creative.content))
creative_hash = lowercase_hex(creativeHashBytes)
```

`creative.content` must be a string containing valid Unicode scalar values. Reject malformed UTF-8 in the JSON input and unpaired Unicode surrogates in the decoded string; do not silently replace invalid input. Encode the decoded string as UTF-8 without adding a byte-order mark or terminator. Preserve every character already present in the string.

Do not trim whitespace, normalize line endings or Unicode, parse and reserialize HTML, decode HTML entities, or minify the markup before hashing. JSON quotation marks and escape syntax are not part of the hash input: `"<p>Hi</p>"` and `"\u003Cp\u003EHi\u003C/p\u003E"` encode the same string and produce the same hash. A change to whitespace within that string, including LF versus CRLF, changes the hash even when the rendered banner looks identical.

The JSON `creative_hash` is exactly 64 lowercase hexadecimal characters. The commitment uses the raw 32-byte digest, not its hexadecimal text. Both publisher and oracle recompute it from the submitted original HTML and reject a mismatch with the claimed hash. Preserve that HTML string through verification and rendering; transport may change JSON escaping only if the decoded string stays identical.

This hashes the HTML and its literal asset references. It does not fetch or hash the contents of referenced images, stylesheets, or scripts, nor the resulting DOM or rendered pixels.

#### Original token and payment hash

After preparing the locked ecash as a Cashu V4 token and inserting the pixel, the bidder hashes the completed original HTML string and the exact payment token string. The payment hash retains its existing definition:

```text
payment_hash = lowercase_hex(SHA256(UTF8(payment)))
```

Hash the bare original `cashuB…` string, including its prefix, without JSON quotation marks, surrounding whitespace, or a `cashu:` URI prefix. Do not decode and re-encode the token before hashing. Every encoded field, including any optional DLEQ data or memo, is covered. The token contains no spending witnesses; later spending signatures are added to a separate transaction built from decoded proofs. Equivalent tokens with different serializations can have different hashes, so proof-reuse checks must inspect their decoded proofs.

#### Commitment digest and signature

The agreed construction is:

```text
paymentHash = SHA256(UTF8(payment))
creativeHashBytes = SHA256(UTF8(creative.content))
contextBytes = JCS([
    bid_request_id,
    impression_id,
    bid_nonce,
    "html",
    creative.width,
    creative.height
])
contextHash = SHA256(contextBytes)

message = paymentHash || creativeHashBytes || bidderPublickeyBytes || contextHash
tagHash = SHA256(UTF8("ROB/commitment/v1"))
digest = SHA256(tagHash || tagHash || message)
signature = BIP340Sign(refundPrivateKey, digest)
```

`||` means byte concatenation. Each of the four components of `message` is exactly 32 bytes, in the displayed order. `paymentHash` is the raw digest, equivalent to hex-decoding `payment_hash`; `creativeHashBytes` is the decoded 32-byte creative hash; `bidderPublickeyBytes` is the decoded 32-byte x-only Nostr public key. Hash the byte values, not their hex text. Reject malformed or wrong-length values.

The tag is exactly the UTF-8 string `ROB/commitment/v1`, without quotes or a terminator. The construction is BIP-340-style tagged hashing and separates ROB commitments from other messages signed with the refund key. Pass the resulting 32-byte `digest` directly to the BIP-340 signing/verification API; do not add another application-level hash. The signature is 64 bytes, represented as 128 lowercase hexadecimal characters in JSON. The ROB tag labels the commitment construction; the signed request separately declares `version: 1`. [BIP-340: Tagged Hashes](https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki#design).

**Agreed 2026-09-22:** `JCS(...)` means the UTF-8 bytes produced by RFC 8785 JSON Canonicalization Scheme for the fixed six-element array above, replacing the previously unspecified `Encode(...)`. Preserve array order and add no byte-order mark, terminator, or formatting whitespace. The first four elements are strings; width and height are JSON numbers restricted to positive safe integers (`1..9007199254740991`). Reject invalid types instead of coercing them. JCS defines string escaping and number serialization and does not normalize Unicode. [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785.html#section-3).

The request reference is the original signed event's lowercase hexadecimal ID, used as a string inside the context array. Use the exact decoded `impression_id` and `bid_nonce` strings under the [identifier rules](NOSTR.md#identifier-formats). The oracle derives the request ID and impression ID from the original signed request, fixes the creative type to `html`, and takes the chosen dimensions from the authorization payload. The context hashes these six values, not an object or the serialized authorization body. JCS applies only to this context: the exact-token and HTML hashes, Nostr event hashing, NIP-98 body hashing, and Cashu signing retain their own agreed rules.

Verification must also match the declared size to an original request `banner_sizes` entry, and match `publisher_payment_pubkey`, `oracle.payment_pubkey`, and the accepted mint against the request and token. The publisher checks the bid's declared gross amount against the committed proofs; the oracle derives the gross authorized amount from those proofs without a separate amount field. These checks cannot be replaced by accepting a publisher-supplied context hash.

#### Transport identity, privacy, and spending

The publisher authenticates the Nostr sender through the NIP-59 seal and requires that sender's key, the rumor's key, and the Nostr key inside the signed commitment to match. The refund-key commitment alone does not prove that the named Nostr identity participated. It provides independently verifiable authorization from the refund-key holder to the oracle; Nostr delivery authentication and payment authorization have distinct roles.

Fresh refund keys keep the bidder's stable identity out of its refund conditions. In ordinary settlement the mint receives proofs and Cashu spending witnesses, not the ROB commitment or its named Nostr identity. The publisher and oracle see the identity-to-payment association; this is not a claim of complete unlinkability or protection against their disclosure of that association. The memo remains optional token metadata and supplies no independent authorization. [Cashu swap request](https://github.com/cashubtc/nuts/blob/main/03.md#example).

The commitment signature is kept outside the token and its spending witnesses. It adds no third settlement signer and cannot serve as a refund-spend authorization: actual settlement and refund signatures cover the Cashu transaction under `SIG_ALL`. The bidder retains the fresh refund private key for later recovery. Changes to the bidder's own hosted assets are outside this commitment's threat model; no dependency hashes or asset manifest are required for the POC. The commitment authenticates the approved payload/payment association, not what was displayed.

## Trust model and POC limits

The publisher controls the auction. Payment depends on its declared oracle correctly checking the signed commitment, payment, pixel URL, and callback. A publisher can request the pixel directly while displaying another creative or nothing at all, even without oracle collusion. Publisher–oracle collusion can bypass the checks entirely.

The bidder must independently authenticate the [oracle identity binding before funding](#2-bidders-evaluate-the-opportunity). This prevents relying on an unauthenticated publisher-supplied substitute; it does not establish the oracle's honesty or strengthen the pixel's evidence of delivery.

The pixel is a delivery signal, not proof of rendering or viewability. Stronger verification is outside the POC's scope. The design also does not establish independently verifiable auction fairness.

The mint must enforce spending conditions and honor its ecash. Refund eligibility limits how long the bidder must wait before attempting recovery; it does not guarantee immediate recovery or prevent a competing publisher spend after expiry.

## Details still to specify

These are open questions, not additional protocol decisions:

| Area | Remaining work |
| --- | --- |
| Message formats | Domain syntax/normalization, extension/unknown-field rules, remaining deprecated-field handling, and remaining bid fields, amount representation, and URL comparison rules. The minimum signed request schema, nested `oracle` fields, and impression/bid-nonce formats are agreed. `site.domain` is required and `device` is optional; viewer IPs, geographic coordinates, and persistent device identifiers are excluded from public requests. The OpenRTB `user` object is outside v1. `bid_request_id` is the signed bid-request event's ID. HTML banner markup as a string is the only v1 creative format; the request's `mints` array and bid's V4 token `payment` string are agreed. |
| Seller authorization | Exact ads.txt extension syntax, domain scope, authenticated retrieval, caching, and key-rotation/removal behavior. Including the extension in the specification is agreed; publication and bidder enforcement are optional, and this is not a protocol funding or settlement prerequisite. |
| HTML banners | Additional compatibility fields, the common rendering profile's HTML/CSS/JavaScript support and isolation rules, and any separate markup budget. A shared v1 profile, accepted fixed sizes, and one explicitly declared, committed size per bid are agreed. V1 inventory is website-only; in-app inventory, fluid/aspect-ratio sizing, other media types, and URL-only creative responses are outside v1. |
| Payload sizes | Numeric common request/bid maximums, exact byte-counting boundaries, and fields for a publisher to advertise a smaller bid limit. Protocol-wide ceilings and optional lower advertised limits are agreed. |
| Transport | Relay discovery, final inner bid tags, gift-wrap interoperability, duplicates, and the exact publisher-to-oracle API. The oracle MVP uses HTTPS without a required relay subscription. Request kind `28300` and NIP-59 ephemeral wrapping of bid kind `28301` are agreed. |
| Identity and keys | Publisher identity-to-payment-key binding, recipient-key selection, oracle service identity binding, and remaining NIP-98 tag/URL rules. The oracle authorization endpoint requires NIP-98 from the original request's publisher, including a verified body hash; its freshness window is 60 seconds either side of the oracle clock, with reuse permitted while fresh. Bidders choose how to establish the required trusted oracle binding before funding; v1 requires no shared oracle attestation/discovery protocol. Refund-key commitment verification and the separate Nostr sender check are agreed. |
| Auction rules | Remaining interoperable eligibility rules. V1 offers one impression per bid request; multiple independent, immutable bids per bidder are allowed. Ranking, tie-breaking, collection, and early-stopping policy belong to the publisher. `closes_at` is an upper bound in Unix seconds; early selection is allowed and creates no bidder notification. |
| Cashu validation | Publisher funding-validation profile, including mint capabilities, proof authenticity, keyset units, and spendability; prevention of proof reuse across bids. The oracle MVP performs local authorization checks without mint calls or a requirement for oracle-side DLEQ verification. |
| Signed commitment | Complete conformance fixtures and remaining replay/deduplication rules. The context uses RFC 8785/JCS over the agreed fixed six-element array. `bid_request_id` fixes the original request reference. Fresh refund-key BIP-340 signatures, the tagged digest construction, signed bidder identity and chosen creative dimensions, exact-token payment hashing, and exact UTF-8 HTML creative hashing are agreed. |
| Callback handling | Exact HTTP responses and implementation fixtures remain. The MVP persists callbacks across restarts without automatic expiry; cleanup is deferred. Repeated callbacks do not create additional payable impressions. A missing callback returns an immediate retryable `pixel_not_observed` result without reserving the impression. At most one bid commitment may be authorized per `(bid_request_id, impression_id)`; that binding is permanent and retries cannot authorize another bid. |
| Joint signing | Cashu implementation compatibility and API payload limits. Spending-signature representations follow NUT-00 and NUT-11; output payment validity belongs to the publisher. The oracle MVP derives inputs from the token in encoded order, fixes ordered outputs on authorization, and returns only its spending signature. Exact retries return the stored signature; changed outputs are rejected. Melt support is outside this milestone. |
| Refund implementation | Scheduling, mint outages, pending spends, and retries. |

## Technical references

The minimum signed request schema with nested `oracle` data, impression/bid-nonce formats, and RFC 8785/JCS encoding of the commitment context were agreed on 2026-09-22. See [NOSTR.md: Minimum signed request content](NOSTR.md#minimum-signed-request-content), [identifier formats](NOSTR.md#identifier-formats), and the [commitment construction](#commitment-digest-and-signature).

An ads.txt extension for websites to list authorized publisher Nostr signing keys, with publication and enforcement left optional, was agreed on 2026-09-22. Bidders can apply it as a local participation rule; ROB does not require successful seller verification before funding. The existing oracle-verification requirement remains mandatory.

One common v1 rendering profile and common maximum request/bid sizes, with optional smaller publisher-advertised bid limits, were agreed on 2026-09-22. Exact rendering capabilities, size budgets, and byte-counting boundaries remain open.

Reuse of OpenRTB `site` and `device` for advertising context, with the `user` object deferred, was agreed on 2026-09-22. The same discussion required `site.domain`, made `device` optional, and excluded viewer IP addresses, precise coordinates, and persistent device identifiers from public requests.

Website-only inventory and mandatory independent bidder verification of the oracle identity binding before funding were agreed on 2026-09-21. Bidders choose their verification mechanism; trusted local configuration can satisfy the requirement, and v1 defines no common oracle attestation/discovery protocol.

A nonempty list of accepted fixed banner sizes in CSS pixels and one explicitly declared, committed size per bid were agreed on 2026-09-21. Both publisher and oracle reject unlisted sizes; fluid/aspect-ratio sizing is deferred.

Exactly one offered impression per v1 bid request, multiple independent immutable bids per bidder, and publisher-defined ranking and tie-breaking were agreed on 2026-09-21. The same discussion established `closes_at` as an upper bound that permits early selection, with collection and stopping behavior left to publisher implementations and no bidder-facing rejection or early-closure messages.

The stable bid-request identifier `bid_request_id`, defined as the signed Nostr bid-request event's ID, and at most one authorized bid commitment per `(bid_request_id, impression_id)` were agreed on 2026-09-21. V1 permits no switch to another bid after the oracle signs.

HTML banners as the sole v1 creative format were agreed on 2026-09-16 after reviewing Prebid's media-specific payloads. The decision covers inline HTML markup and the existing bidder-inserted pixel flow; other creative formats are deferred.

Exact HTML creative hashing was agreed on 2026-09-17: SHA-256 over the UTF-8 encoding of the decoded HTML string, without normalization, with invalid Unicode rejected. Referenced asset contents remain outside the hash.

The initial design was described on 2026-09-08. The pixel flow, bidder-chosen refund deadline, and initial amount/mint/fee rules were agreed on 2026-09-10. First-price pricing, `closes_at` in Unix seconds, and a publisher-provided list of accepted mints with one selected mint per bid were agreed on 2026-09-15. Fresh refund-key BIP-340 commitments with the bidder identity as signed data and a tagged digest were agreed on 2026-09-16; this supersedes the earlier identity-key commitment proposal. Sources were checked on 2026-09-08, with NUT-11 locktime/refund and NUT-00/NUT-01 amount/unit rules checked on 2026-09-10, and BIP-340, NUT-11 key rules, and NUT-03 swap inputs checked on 2026-09-16. Exact revisions should be pinned for the wire specification.

- [OpenRTB reference](OPENRTB.md): advertising message concepts.
- [Prebid banner size research](PREBID-SIZES.md): multiple accepted sizes, returned dimensions, and validation behavior that informed ROB's banner size contract.
- [Cashu SIG_ALL review](CASHU-SIG-ALL.md): pinned source review, official-vector verification, signature-only response, and remaining signing-profile choices.
- [Nostr NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md): events, keys, relays, and subscriptions.
- [Cashu NUT-00](https://github.com/cashubtc/nuts/blob/main/00.md): proofs and tokens.
- [Cashu NUT-01](https://github.com/cashubtc/nuts/blob/main/01.md): keysets and units.
- [Cashu NUT-10](https://github.com/cashubtc/nuts/blob/main/10.md): spending-condition secrets.
- [Cashu NUT-11](https://github.com/cashubtc/nuts/blob/main/11.md): P2PK, multisignature conditions, locktime, and `SIG_ALL`.
- [Cashu NUT-03](https://github.com/cashubtc/nuts/blob/main/03.md): swapping proofs for fresh ecash.
- [BIP-340](https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki): Schnorr signatures over secp256k1, x-only public keys, and tagged hashes.
