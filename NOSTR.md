# Real Open Bidding: Nostr events

Status: working design draft, started 2026-09-15; minimum signed request schema, identifier formats, and commitment context encoding agreed 2026-09-22. This document records agreed transport decisions and proposals for discussion. Remaining bid transport and API details are identified below.

## Purpose

[FLOW.md](FLOW.md) describes the end-to-end auction, payment, and refund flow. This document defines its Nostr communication layer. [OPENRTB.md](OPENRTB.md) remains the advertising reference; inclusion there does not make a field part of ROB.

The transport choices recorded here develop the open Nostr questions in FLOW.md. Cashu payment conditions and the pixel verification model remain as described there.

## 1. Decisions so far

| Topic | Current position |
| --- | --- |
| Event inventory | Two ROB message types: auction request and bid submission. Bids use NIP-59's seal and gift-wrap layers for transport. |
| Event lifetime | Publish auction requests as ephemeral `28300` events and bids inside ephemeral `21059` gift wraps. |
| Payload encoding | ROB payloads use JSON in `content`. A bid's JSON is the inner `28301` rumor's content; the seal and gift wrap contain ciphertext. |
| Discovery fields | Keep advertising and payment fields in JSON for now; additional discovery tags are deferred. Routing/reference tags remain a separate proposal. |
| Auction request | Public broadcast from publisher to listening bidders, offering exactly one impression in v1 and retaining `impression_id`. |
| Advertising context | Required OpenRTB `site` with nonempty `site.domain`; optional `device`. Preserve standard field meanings. Public requests exclude viewer IP addresses, precise coordinates, and persistent device identifiers under FLOW.md's context rules. `user` is outside v1; remaining extension/deprecated-field handling is open. |
| Seller authorization | ROB specifies an optional ads.txt declaration authorizing publisher Nostr signing keys for website inventory. Bidders may enforce it against the request envelope's `pubkey` and `site.domain`; a missing or unverified listing is not a protocol validity or funding failure. Exact extension syntax and retrieval/cache rules remain draft. |
| Bid request ID | `bid_request_id` is the signed `28300` event's `id`, stable across retransmission and used by bids, pixel callbacks, commitments, and payment authorizations. |
| Payment exclusivity | At most one authorized bid commitment per `(bid_request_id, impression_id)`. Retries remain bound to that commitment and its original payment proofs; no switch to another bid after oracle signing. |
| V1 creative scope | Website HTML banners only, supplied as complete HTML markup strings with the oracle pixel inserted before signing. `html` is the sole v1 creative type; in-app inventory, other media formats, and URL-only creative responses are excluded. |
| Rendering profile | One shared v1 profile with JavaScript in an isolated iframe, HTTPS assets/scripts, and new-tab landing pages; no access to or navigation of the publisher page and no per-request profile selection. Precise enforcement remains open; renderer implementation is publisher-local. |
| Payload size limits | Common maximum request/bid sizes, with publishers able to advertise a smaller bid limit. Numeric budgets, byte-counting boundaries, and lower-limit field names remain open. |
| Banner sizing | The request's nonempty `banner_sizes` array contains `{ width, height }` alternatives in positive safe integer CSS pixels. Each bid explicitly declares one advertised pair, covered by its commitment. Unlisted sizes are ineligible; fluid/aspect-ratio sizing is excluded. |
| Auction pricing | Always first-price: the winner pays its full bid amount before redemption fees. No `auction_type` field. |
| Bid selection | Ranking and tie-breaking among eligible bids are publisher-defined. First-price fixes the selected bidder's payment amount. |
| Default publisher funding policy | Fresh publisher payment key per new auction; DLEQ on every proof verified against saved authenticated mint keysets, plus the existing 2-of-2 locking and local eligibility checks. No mint spend-state query during bid acceptance. This default policy adds no oracle-side DLEQ or mint calls. |
| Multiple bids | A bidder may submit multiple independent, immutable bids for one opportunity, each with a fresh `bid_nonce`, refund key, and separate funding. Later offers do not replace earlier offers. |
| Bid collection deadline | Required `closes_at`: integer Unix timestamp in seconds and an upper bound on timely receipt. The publisher may select early; collection and stopping behavior are implementation details. |
| Accepted mints | Required `mints`: a nonempty array of Cashu mint URLs accepted by the publisher. Each bid uses exactly one listed mint. |
| Bid payment | Required `payment`: a bare Cashu V4 token string beginning with `cashuB`, containing locked proofs from one accepted mint and no spending witnesses. |
| Payment hash | Lowercase hex SHA-256 of the UTF-8 bytes of the exact original `payment` string. Preserve the string through oracle verification. |
| Creative hash | Lowercase hex SHA-256 of the exact UTF-8 HTML string after JSON decoding, including the inserted pixel. No normalization; reject invalid Unicode. Preserve the string through verification and rendering. |
| Commitment signer | The fresh refund key embedded in every proof signs one BIP-340 Schnorr commitment. All proofs have the same single refund key, separate from the bidder's Nostr identity. |
| Commitment contents | Exact-token payment hash, 32-byte creative hash, bidder Nostr public key, and a hash of the fixed six-element context array, including chosen creative dimensions. Context bytes use RFC 8785/JCS; the enclosing digest uses the `ROB/commitment/v1` tag defined in FLOW.md. |
| Bidder identity | Signed data in the commitment; must match the seal signer and rumor public key at the publisher. The commitment verification key is extracted from the proofs' refund conditions. No second standalone identity-key commitment signature or memo authorization is required. |
| Bid submission | Directed to the publisher using NIP-59 ephemeral gift wrapping: inner `28301` rumor, signed `13` seal, outer `21059` wrap. |
| Bid status | V1 has no ROB bidder receipts, outcome notices, or rejection messages, including no timeout reason or early-closure announcement. |
| Encryption scheme | NIP-44 as used by NIP-59. The exact revision and library compatibility profile remain to be pinned. |
| Publisher–oracle communication | The oracle MVP uses HTTPS with NIP-98 authentication by the original request's publisher and a required body hash. Its pixel endpoint remains public. Exact API and authentication-profile details remain open. The oracle requires no Nostr relay subscription; NIP-98 events are carried in HTTP headers, not published through relays. |
| Oracle authorization endpoint | Configured or discovered separately by the publisher; omitted from the auction request. |
| Oracle verification | Before funding, bidders must independently authenticate the declared oracle identity, payment key, and pixel base URL as belonging to an oracle they trust. The publisher's declaration alone is insufficient. Bidders choose their verification mechanism; trusted local configuration can satisfy the requirement. V1 requires no shared oracle attestation/discovery protocol. |
| Numeric kinds | `28300` for public auction requests; `28301` for inner bid rumors. Agreed experimental ROB assignments. The transport reuses NIP-59 kinds `13` and `21059`. |

NIP-01 defines kinds `20000 <= kind < 30000` as ephemeral: relays are not expected to store them. This is a delivery convention, not a confidentiality or deletion guarantee. [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md).

Neither selected kind was listed in the [Nostr kind registry](https://github.com/nostr-protocol/registry-of-kinds/blob/master/schema.yaml) when checked on 2026-09-15. This check does not guarantee absence of use elsewhere. Publish the ROB definitions to the registry once the schemas are settled.

### Payload size limits

**Agreed 2026-09-22:** v1 has common maximum sizes for bid requests and bids. A publisher may advertise a smaller accepted bid size in the signed request; its advertised limit cannot exceed the protocol maximum. Bidders must respect both the common maximum and any lower advertised maximum.

The numeric limits and exact measurement boundaries remain open. They must be defined with the complete serialized payment token and NIP-59/NIP-44 overhead in mind; a limit on creative HTML alone would not bound the full bid. The wire schema must specify which decoded payloads and/or serialized event layers each limit measures. No numeric budget or field name is chosen by this decision. ROB's agreed lack of bidder rejection/status messages also applies to size-related rejection.

## 2. Auction request

Kind: `28300` (`ROB_AUCTION_REQUEST`).

The publisher signs and broadcasts a website HTML banner opportunity. Bidders subscribe to suitable relays and evaluate the publisher, opportunity, accepted mints, and oracle before funding a bid.

### Information to represent

These are semantic requirements and proposed additions; only explicitly agreed field names and identifiers are final.

| Information | Status |
| --- | --- |
| HTML banner opportunity and impression identifier | Exactly one offered website impression per v1 bid request, identified by `impression_id`, with a nonempty `banner_sizes` array of `{ width, height }` pairs in CSS pixels. HTML banners are the only v1 media format; in-app inventory is excluded. |
| Site and device context | Required `site` with nonempty `site.domain`; optional `device`, using OpenRTB 2.6-202606 definitions subject to ROB's public-data exclusions. `user` is outside v1. |
| Bid request ID | `bid_request_id` is the signed request event's `id`, obtained from the envelope rather than embedded in its own content. |
| Publisher payment public key | Required `publisher_payment_pubkey`, using a compressed Cashu public key. Its declaration is covered by the publisher's signed request; additional identity-to-payment-key binding requirements remain open. |
| Accepted Cashu mint URLs | Required `mints`: a nonempty array of mint URL strings. |
| Oracle identity, payment public key, and pixel base URL | Required `oracle` object containing `pubkey` (Nostr identity), `payment_pubkey` (compressed Cashu key), and `pixel_base`. The bidder must independently verify their binding to a trusted oracle before funding. |
| Protocol version | Required integer `version: 1` in the signed request content. |
| Bid collection deadline | Required `closes_at`, an upper bound on timely receipt expressed as an integer Unix timestamp in seconds. |
| Maximum accepted bid size | Optional publisher-advertised limit below the common protocol maximum; numeric budgets, measurement boundary, and field name remain to be defined. |
| Bid-delivery relay information | Proposed; exact relay-selection rules remain open. |

### Minimum signed request content

**Agreed 2026-09-22:** the kind-`28300` event's `content` is a JSON string encoding the following request object. All shown fields are required; the oracle's data is grouped in the `oracle` object. Key placeholders below are illustrative, not valid public keys or a cryptographic fixture.

```json
{
  "version": 1,
  "impression_id": "imp-1",
  "banner_sizes": [
    { "width": 300, "height": 250 }
  ],
  "site": { "domain": "publisher.example" },
  "closes_at": 1800000003,
  "mints": ["https://mint.example"],
  "publisher_payment_pubkey": "<compressed-Cashu-public-key>",
  "oracle": {
    "pubkey": "<Nostr-public-key>",
    "payment_pubkey": "<compressed-Cashu-public-key>",
    "pixel_base": "https://oracle.example/pixel"
  }
}
```

`version` is the JSON number `1`, not a string. `banner_sizes` is nonempty and each entry has numeric `width` and `height` in CSS pixels, restricted to positive safe integers (`1..9007199254740991`). `site` and optional `device` retain their agreed OpenRTB definitions and public-data exclusions. `closes_at` remains an integer Unix timestamp in seconds, and `mints` remains a nonempty array of accepted mint URL strings.

`oracle.pubkey` uses Nostr's 32-byte x-only public-key representation as 64 lowercase hexadecimal characters. `publisher_payment_pubkey` and `oracle.payment_pubkey` use Cashu's compressed public-key representation. `oracle.pixel_base` supplies the pixel URL base and has no trailing slash, query string, or fragment. The authorization endpoint remains configured or discovered separately. The request's Nostr envelope supplies the publisher's identity in `pubkey` and the `bid_request_id` in `id`; neither is duplicated in content. An oracle identity key and its payment key have distinct roles.

**Agreed 2026-09-22:** the default publisher uses a fresh `publisher_payment_pubkey` for each new auction, distinct in role from its Nostr signing identity. It establishes and retains the auction payment key before signing the request; retransmitting the same event retains that key. This uses the existing signed field and does not add a new key-binding message. See [FLOW.md: Default publisher funding validation](FLOW.md#default-publisher-funding-validation).

The complete original signed event, with this content, is the `SignedBidRequest` supplied to the [authorization endpoint](#5-oracle-authorization-payload). Preserve its original `content` string when verifying its NIP-01 event ID and signature. The commitment's separate JCS context encoding does not canonicalize or rewrite the signed request event. Additional extension/unknown-field rules and payload-size limits remain open.

### Identifier formats

**Agreed 2026-09-22:** identifiers have these formats in request content, bids, authorization payloads, commitment contexts, and pixel paths:

| Identifier | Format |
| --- | --- |
| `bid_request_id` | The original signed kind-`28300` event's `id`: 64 lowercase hexadecimal characters under NIP-01. |
| `impression_id` | Publisher-chosen, case-sensitive string of 1–64 ASCII letters, digits, underscores, or hyphens; the entire value must match `[A-Za-z0-9_-]{1,64}`. |
| `bid_nonce` | 16 fresh random bytes generated by the bidder per independent bid, encoded as exactly 32 lowercase hexadecimal characters. |

Compare the decoded string values exactly, without trimming or case conversion. A bid retransmission preserves its nonce; a new independent bid requires a new nonce. These alphabets allow literal pixel URL path segments without percent-encoding. The nonce is public and separate from a Cashu proof nonce. [NIP-01 event IDs](https://github.com/nostr-protocol/nips/blob/master/01.md#events-and-signatures).

### Request terms

The request does not impose a Cashu refund deadline. Each bidder chooses its own deadline; the publisher decides whether the remaining settlement time is acceptable.

**Agreed 2026-09-21:** `bid_request_id` identifies the auction's exact published bid request. Retransmitting the same signed event preserves this ID; changing its signed contents creates a new event ID and is treated as a new auction. All references must resolve to that original signed request. The pair `(bid_request_id, impression_id)` identifies an offered ad opportunity; `bid_nonce` distinguishes bids for that opportunity. The one-authorized-bid rule is defined in [FLOW.md](FLOW.md#one-authorized-bid-per-impression).

The publisher lists its accepted mints in `mints`, including when it accepts only one. The bidder chooses one listed mint, encoded in the bid's Cashu token. All proofs for that bid must come from that mint's `sat` keysets and total the full bid amount; combining proofs from different mints within one bid is not supported. The chosen mint is bound by the creative/payment commitment. Settlement and refunds use that same issuing mint. The publisher continues to bear redemption fees, which may differ between accepted mints. The request's URL comparison rules remain to be specified consistently with Cashu V4's mint URL rules; never normalize the committed token string during hashing.

The oracle's authorization endpoint is not part of the request. The publisher configures or discovers it separately to obtain a spending signature. Bidders need the declared oracle identity to evaluate participation, its payment key to lock ecash, and its pixel base URL to construct the creative. NIP-98 authenticates the publisher to the endpoint. Binding the separately configured service to the declared oracle identity and payment key remains a distinct service-authentication question.

**Agreed 2026-09-21:** bidders MUST independently verify the oracle identity binding before locking funds. Authenticating the publisher's Nostr signature establishes who made the declaration, not that the declared key and pixel endpoint belong to a trusted oracle. Without a verified binding, the bidder must not fund or submit the bid. The bidder chooses the verification mechanism, with trusted local configuration sufficient; v1 requires no common oracle attestation/discovery protocol. Changed keys or endpoints must also have a verified binding. See [FLOW.md](FLOW.md#2-bidders-evaluate-the-opportunity) and [ADR-0004](docs/adr/0004-verify-oracle-before-funding.md).

**Agreed 2026-09-21:** accepted banner sizes are alternatives for the request's single impression. Every bid explicitly declares one pair of positive integer CSS-pixel dimensions from that list, and its commitment covers the chosen width and height. Publisher and oracle reject missing, invalid, or unlisted dimensions. Responsive selection of the advertised list is publisher-local before publication; fluid/aspect-ratio sizing is outside v1. The agreed request field is `banner_sizes`, with `{ width, height }` entries as specified above. See [FLOW.md: Banner sizing](FLOW.md#banner-sizing).

### Pricing and bid collection deadline

ROB always uses first-price pricing. A winning 10-sat bid pays 10 sats gross; the publisher receives the value remaining after redemption fees. The request carries no `auction_type` field. Ranking and tie-breaking among eligible bids are publisher-defined, including whether to prefer gross amount, proceeds after fees, or creative suitability. Remaining eligibility rules are still to be specified.

`closes_at` is an absolute bid collection deadline in Unix seconds, using the same time unit as the Nostr envelope's `created_at`. It replaces the previously discussed `closes_at_ms` proposal. For example, `created_at: 1800000000` and `closes_at: 1800000003` place the deadline three seconds after the stated creation time; they do not guarantee that the publisher considers bids for the full three seconds.

The publisher evaluates timeliness using its own receipt time: a bid received at or after `closes_at` is late. The bidder's event timestamp does not establish timely receipt. Network transit consumes the available bidding window; seconds precision does not compensate for delay or clock differences. This field sets neither a fixed auction duration nor a Cashu refund deadline.

**Agreed 2026-09-21:** the publisher may select early and proceed through rendering, oracle authorization, and settlement before `closes_at`, subject to the existing payment rules. Collection and stopping policy are implementation details. ROB defines no bidder notification for timeout, rejection, or early closure; a bid received before the deadline may still be unused. See [delivery without status messages](#4-delivery-without-status-messages) and [ADR-0003](docs/adr/0003-publisher-controlled-early-selection.md).

### Proposed envelope

- `pubkey`: the publisher's Nostr signing identity.
- `kind`: `28300`.
- `content`: a JSON-encoded request object.
- `tags`: no ROB discovery tags for now; start with an empty array.
- Other envelope fields and the event signature follow NIP-01.

**Agreed 2026-09-22:** the request uses OpenRTB `site` and `device` for contextual information, preserving their standard field names, types, meanings, and nested definitions. The OpenRTB `user` object is outside v1. See [FLOW.md: Advertising context](FLOW.md#advertising-context) and [ADR-0005](docs/adr/0005-reuse-site-and-device-context.md).

**Agreed 2026-09-22:** `site` and its nonempty `domain` string are required; `device` is optional. Public requests must exclude viewer IP addresses, precise coordinates, and persistent device identifiers, including the fields enumerated in [FLOW.md: Advertising context](FLOW.md#advertising-context). Browser, language, screen, and capability information remain supported. Extensions or renamed fields cannot carry the prohibited device data. Requests containing prohibited data are invalid; removing it from an already signed event does not preserve that request's identity. All included content is public. [Reusing OpenRTB objects in ROB](OPENRTB-ROB-PROFILE.md) records the research and remaining profile questions; it does not define a complete wire schema.

**Agreed 2026-09-22:** a website may publish authorized publisher Nostr keys using ROB's ads.txt extension. A bidder may check the signed request envelope's `pubkey` against that declaration for `site.domain` and require a verified match as its own participation policy. ROB requires neither a published listing nor successful seller verification before funding. Failed or missing authorization is not itself a protocol rejection, and no seller-authorization status message is added. See [FLOW.md: Optional seller authorization](FLOW.md#optional-seller-authorization) and [the extension draft](ADS-TXT-NOSTR.md).

Bidders initially filter by event kind and, optionally, publisher identity, then inspect the JSON payload. Additional discovery tags can be considered later.

## 3. Bid submission

Kind: `28301` (`ROB_BID_SUBMISSION`).

The bidder submits a complete creative and funded offer for an auction. The JSON payload is carried in an unsigned `28301` event (a rumor), sealed by the bidder, and gift-wrapped to the publisher. Only the outer `21059` event is published.

### Information to represent

| Information | Status |
| --- | --- |
| Bid request and impression references | Required `bid_request_id` equals the original signed `28300` event's `id`; `impression_id` matches that request's value under the agreed identifier format. |
| Fresh bid nonce | Required `bid_nonce`: 16 fresh random bytes represented as 32 lowercase hexadecimal characters, as specified under identifier formats. |
| Complete original HTML banner markup, including the completed pixel URL | Required as a string. `html` is the only v1 creative type. A URL-only response or another media format is invalid. |
| Bid creative size | Required explicit width and height in positive safe integer CSS pixels, matching a request `banner_sizes` entry and covered by the commitment's bid context. Required even for a request offering only one size; the example aligns with the oracle payload's `creative.width` and `creative.height`. |
| Positive integer gross amount in sats per impression | Required by the flow. |
| Selected mint and locked ecash totaling the bid amount | Required `payment`: a Cashu V4 token string. The token encodes the selected mint, unit, and proofs. |
| Refund-key-signed creative/payment commitment | Required: BIP-340 signature covering the payment hash, creative hash, bidder Nostr identity, and JCS-encoded bid context under FLOW.md's tagged digest construction. The full commitment object is defined in the authorization payload below. |
| Protocol version | Proposed. |

Refund conditions are encoded in the token's locked proofs. The payment field adds no separate mint, unit, proof array, refund deadline, or refund key fields. Generate a fresh refund key per logical bid; every proof must have the same single refund key and `n_sigs_refund` of `1`. Extract the commitment verification key from these proofs.

A bidder may submit multiple independent, immutable bids for the same `(bid_request_id, impression_id)`. Each new offer uses a fresh `bid_nonce`, refund key, and separate funding, without reusing another bid's proofs. A later offer does not replace or withdraw an earlier one. Retransmissions preserve the original offer, token, refund key, nonce, and commitment; v1 defines no amendment or withdrawal message. See [FLOW.md](FLOW.md#3-bidder-sends-a-prepaid-response) and [ADR-0002](docs/adr/0002-independent-immutable-bids.md).

### Gift-wrapped transport

| Layer | Kind | Contents and authentication |
| --- | --- | --- |
| Inner rumor | `28301` | Bidder identity and JSON bid payload; no event signature. Proposed inner tags: `p` for publisher and `e` for auction. |
| Seal | `13` | NIP-44-encrypted rumor; signed by the bidder; empty tags. |
| Ephemeral gift wrap | `21059` | NIP-44-encrypted seal; signed with a fresh one-use key; public `p` tag identifies the publisher. |

NIP-59 supplies these wrapping rules and specifies that relays must not store `21059`. The bidder identity, auction reference, and inner kind are encrypted; the recipient remains visible on the outer event. This provides metadata protection, not anonymity against traffic analysis. [NIP-59](https://github.com/nostr-protocol/nips/blob/master/59.md).

Publishers subscribe to `21059` events addressed to their identity, unwrap them, and process inner `28301` messages. Validate both outer and seal signatures, the rumor's event hash, and equality of the seal signer's public key and rumor's public key. Match the outer recipient, proposed inner recipient, and original request publisher. Require the bidder Nostr public key signed inside the commitment to match the seal signer and rumor key. Verify the commitment signature separately using the refund key extracted from every payment proof; the Nostr identity is not that signature's verification key.

Only the outer wrap travels through relays; the inner rumor and seal are never published separately. NIP-59 recommends obscuring the seal/wrapper timestamps. ROB's auction cutoff still uses the publisher's receipt time, not those timestamps. Supporting relays and timestamp policies need interoperability checks. ROB does not adopt NIP-17 chat payloads or its inbox-discovery rules; bid relay selection remains a ROB decision.

### Proposed bid payload example

The following illustrates the agreed `bid_request_id`, token-string payment, and refund-key commitment inside an otherwise proposed bid schema. It is not a cryptographic test vector. It uses the signed bid-request event's ID as `bid_request_id` and illustrates an HTML banner bid. Angle-bracket values stand for actual identifiers, keys, token data, hashes, and signatures; the token placeholder is not a valid Cashu token. Remaining field names and nesting are proposed; the payment string is carried once at bid level and is covered by the commitment's payment hash.

This is the JSON object serialized into the inner rumor's `content`, before sealing and wrapping:

```json
{
  "version": 1,
  "bid_request_id": "<bid-request-event-id>",
  "impression_id": "imp-1",
  "bid_nonce": "00112233445566778899aabbccddeeff",
  "amount_sat": 8,
  "creative": {
    "type": "html",
    "width": 300,
    "height": 250,
    "content": "<a href=\"https://advertiser.example\"><img src=\"https://advertiser.example/banner.png\" width=\"300\" height=\"250\" alt=\"Example ad\"></a><img src=\"https://oracle.example/pixel/<bid-request-event-id>/imp-1/00112233445566778899aabbccddeeff\" width=\"1\" height=\"1\" alt=\"\">"
  },
  "payment": "cashuB<serialized-token>",
  "commitment": {
    "bidder_pubkey": "<32-byte-bidder-nostr-public-key-as-hex>",
    "creative_hash": "<32-byte-creative-hash-as-lowercase-hex>",
    "payment_hash": "<32-byte-payment-hash-as-lowercase-hex>",
    "sig": "<64-byte-refund-key-BIP340-signature-as-lowercase-hex>"
  }
}
```

Proposed interpretation and validation:

- `bid_request_id` equals the original signed bid-request event's `id` and matches the inner rumor's proposed `e` tag; its `p` tag identifies the publisher that signed that request and matches the outer wrap's recipient.
- `impression_id` identifies an offered impression. `bid_nonce` distinguishes the bid and is generated before creating its pixel URL; it is not the bid event ID or a Cashu proof nonce.
- `amount_sat` equals the sum of amounts of all proofs decoded from `payment`. A real token for this example must total 8 sats; multiple proofs from the same accepted mint are allowed.
- `creative.type` is `"html"`, the sole supported v1 creative type. `creative.content` is a string containing the completed original HTML banner markup, with the pixel already inserted. Reject other creative types, native asset objects, VAST payloads, and URL-only creative responses. Referenced images are permitted; a URL cannot replace the HTML body. The example's field names/nesting remain open; the HTML-banner-only scope and exact creative hashing rules are agreed.
- Decode the V4 token to obtain its mint, unit, and proofs. The mint must be accepted by the request, and both the token's unit and the proofs' keyset units must be `sat`. The publisher resolves token keyset IDs according to Cashu before validating the funding or constructing a mint transaction; mint-authenticated keyset resolution is outside the oracle MVP's local checks.
- Each decoded proof's `secret` preserves the issued P2PK conditions. The refund deadline and fresh refund public key are already encoded there. Require the same single refund key on every proof and derive the BIP-340 verification key from its x-coordinate, following FLOW.md. The bidder's refund private key is never included.
- V4 supports optional DLEQ data for mint-signature verification. **Agreed 2026-09-22:** the default publisher requires it on every proof and verifies it against saved, authenticated mint keysets, alongside the auction-specific 2-of-2 locking and local eligibility checks, without a mint spend-state query. The oracle MVP does not require oracle-side DLEQ verification or mint calls. Included DLEQ data is part of the hashed token string; it is not stripped before hashing, and its `r` value must not be forwarded to the mint in the eventual spend. DLEQ alone does not establish current spend state; the fresh auction payment key and local signing state support acceptance before refund eligibility, while later settlement can race with refunds. See [FLOW.md](FLOW.md#default-publisher-funding-validation).
- `commitment.bidder_pubkey` is the bidder's Nostr identity, included as signed data, and must match the authenticated identity from the seal and rumor at the publisher. It is not the commitment verification key. `commitment.sig` is a BIP-340 Schnorr signature verified against the refund key extracted from the proofs. No second standalone commitment signature by the Nostr identity is required. The rumor has no event signature.
- `commitment.payment_hash` binds the exact original token string and therefore its encoded mint, unit, proofs, and any optional data. The signature covers both `creative_hash` and `payment_hash` together with the bid context. Including a hash in the JSON without signing it would not establish the binding.
- The example's `creative.width` and `creative.height` represent the agreed bid creative size; their names and nesting are proposed. The original request must list 300 × 250 as an accepted size for this example to be eligible. Dimensions are signed through the bid context, while `creative_hash` continues to cover only the exact HTML string.
- The commitment digest combines the payment hash, creative hash, bidder Nostr public key, and context hash as four 32-byte values in that order, under the `ROB/commitment/v1` tag. The context identifies the request through `bid_request_id`, plus the impression, bid nonce, creative type, and chosen creative width and height. The dimensions must match an accepted pair in the original request. The publisher/oracle keys and gross amount must match the original request and committed proofs. The signature scheme, digest construction, creative hashing rules, identifiers, and RFC 8785/JCS context encoding are agreed; remaining bid transport details are open. See [FLOW.md: Commitment digest and signature](FLOW.md#commitment-digest-and-signature).

Cashu V4 defines the CBOR/base64url token format, including its mint, unit, keysets, and proofs. ROB reuses that format rather than defining a JSON payment object. [NUT-00: V4 tokens](https://github.com/cashubtc/nuts/blob/main/00.md#v4-tokens). DLEQ verification and the restriction on sharing its `r` value with the mint are described in [NUT-12](https://github.com/cashubtc/nuts/blob/main/12.md#user-to-user-dleq-in-proof).

### Creative hash and original HTML preservation

**Agreed 2026-09-17:** `commitment.creative_hash` is `lowercase_hex(SHA256(UTF8(creative.content)))`, where the content is the exact completed HTML string after JSON decoding, including the oracle pixel. Apply the [HTML creative hash rules in FLOW.md](FLOW.md#html-creative-hash): reject malformed UTF-8 or unpaired surrogates, preserve whitespace and Unicode without normalization, and add no byte-order mark or terminator. Hash the string before HTML parsing or rendering, without decoding HTML entities or rewriting markup.

JSON escape variants that decode to the same string produce the same hash. Changes to the decoded HTML string change the hash. Referenced asset contents are not hashed. The publisher forwards the original HTML string to the oracle unchanged; both recompute its hash and reject a mismatch with the claimed 64-character lowercase hex value. Use the raw 32-byte digest when reconstructing the commitment.

### Payment hash and original token preservation

The payment hash is defined as:

```text
payment_hash = lowercase_hex(SHA256(UTF8(payment)))
```

`payment` is the string value after parsing the bid JSON. Hash the entire bare `cashuB…` string, including that prefix, without JSON quotation marks, a `cashu:` URI prefix, or surrounding whitespace. Require a valid V4 token and reject unsupported token versions or wrappers; do not silently trim or rewrite the string before hashing.

The bidder serializes the locked proofs once, without spending witnesses, and commits to that exact token. The publisher retains the string and forwards it unchanged to the oracle. Neither party decodes and re-encodes it to calculate the hash. JSON escaping around a string does not affect its parsed value, but changes to the token string itself do affect the hash. No JSON or CBOR canonicalization step is part of this hash definition.

Different valid encodings of equivalent proof material may produce different payment hashes. That is intentional: this commitment identifies the original token representation. Proof-reuse checks must inspect decoded proofs rather than treating different token hashes as independent funds.

Everything already encoded in the original token, including optional DLEQ data or a memo, is covered. The bid token must contain no spending witnesses. For settlement or refund, create a separate transaction from decoded proofs and add the required witnesses there; never replace or mutate the original committed token. Matching those transaction inputs to the token is a separate validation step from checking the token-string hash.

The inner rumor has this shape. The content placeholder stands for the JSON string produced from the payload above. It is not encrypted separately inside the rumor, and the rumor has no `sig`:

```json
{
  "id": "<bid-rumor-id>",
  "pubkey": "<bidder-nostr-public-key>",
  "created_at": 1800000001,
  "kind": 28301,
  "tags": [
    ["p", "<publisher-nostr-public-key>"],
    ["e", "<bid-request-event-id>"]
  ],
  "content": "<JSON-encoded-bid-payload>"
}
```

After sealing and wrapping, the published event has this shape. Cryptographic values are placeholders, and the outer timestamp is illustrative:

```json
{
  "id": "<gift-wrap-event-id>",
  "pubkey": "<fresh-one-use-public-key>",
  "created_at": 1799999999,
  "kind": 21059,
  "tags": [
    ["p", "<publisher-nostr-public-key>"]
  ],
  "content": "<NIP-44-encrypted-signed-kind-13-seal>",
  "sig": "<one-use-key-signature>"
}
```

### Commitment and oracle verification

The publisher must provide independently verifiable payment authorization to the oracle. Gift wrapping authenticates delivery to the publisher through the seal, but the inner rumor is unsigned. Forwarding that rumor alone does not establish bidder authorship to the oracle. The refund-key commitment authenticates authorization by the holder of that token's refund key; its named bidder identity is signed data and does not by itself prove that identity's participation.

The wrapped payload carries one commitment signed with the fresh refund key. [FLOW.md](FLOW.md#creativepayment-commitment) defines its authorization and tagged BIP-340 digest construction. The commitment and the stable Nostr identity stay outside the token's spending conditions and witnesses; the mint receives the normal Cashu spending transaction. No memo-based authorization is used. An optional memo remains covered by the exact-token hash. The publisher and oracle can see the identity-to-payment association; a fresh refund key avoids putting that stable bidder identity into mint-visible refund conditions. Context serialization and the minimum signed request schema are agreed; complete fixtures and remaining bid transport details are still needed for interoperability.

**Agreed 2026-09-22:** the oracle MVP authorizes publisher-supplied swap transactions after local verification and a matching pixel callback, without contacting the mint. Funding acceptance, keyset-unit validation, and settlement belong to the publisher; its default validation profile does not require online spend-state queries. See [FLOW.md: Oracle MVP validation boundary](FLOW.md#oracle-mvp-validation-boundary).

Before signing a spend, the oracle:

1. Decodes the payment token and checks its structure, declared mint and unit, proof amounts, and required locking/refund conditions. It extracts the same single refund key from every proof and derives its BIP-340 x-only verification key. A separately claimed verification key cannot override the proofs.
2. Hashes the original token string, recomputes the creative hash and bid context including chosen width and height, and verifies the commitment's Schnorr signature with that refund key. Requires the declared dimensions to match an accepted pair in the original signed request. The bidder Nostr public key is one of the signed values. Successful signature verification does not replace the publisher's funding checks or the oracle's local payment-condition and input checks.
3. Derives the swap's complete ordered input set directly from the committed token, preserving encoded keyset-group and proof-array order. Reject duplicate inputs; no separate input list can substitute, omit, or add proofs. Preserve original secret strings and mint signatures `C` when constructing the signing message. Mint-authenticated keyset-ID resolution belongs to the publisher, which must preserve these proofs and their order when constructing the mint transaction. Later spending witnesses are not part of the original committed token.
4. Applies the remaining request, amount, payment, pixel URL, and callback checks before signing the exact transaction under `SIG_ALL`.
5. Enforces [one authorized bid per impression](FLOW.md#one-authorized-bid-per-impression), atomically persisting the binding from `(bid_request_id, impression_id)` to the commitment and its original payment proofs before releasing a signature. An exact retry returns the existing authorization; a different bid for that opportunity is rejected after authorization has been issued.

The commitment supplies transferable evidence of refund-key authorization; gift wrapping does not make it deniable. Its signature is kept outside the original token and spending witnesses. It is separate from the publisher/oracle settlement signatures and any later refund-spend signature.

Required rejection cases for future conformance fixtures include an identity-key signature in place of the refund-key signature; missing, multiple, or inconsistent refund keys; a mismatch between the signed bidder identity and the authenticated Nostr sender at the publisher; and a changed token/memo, creative hash, identity, context, or domain tag with an unchanged commitment signature. Reject missing, invalid, or unlisted creative dimensions, as well as a changed width or height with an unchanged commitment signature even if both sizes are advertised. Reject malformed UTF-8, unpaired surrogates in the HTML string, and submitted HTML that does not match the claimed creative hash, including whitespace-only changes. Invalid or unexpected transaction inputs must also be rejected even when the commitment itself verifies.

Request fixtures must also cover missing `site` or empty/missing `site.domain`, the excluded `user` object, and prohibited public device data, including data moved into extensions or renamed fields. Authorization fixtures must cover concurrent requests for different bids on one opportunity, an exact retry returning the existing authorization, and refusal to authorize another commitment after signing even if settlement fails or refund eligibility begins.

Authorization fixtures must also cover input ordering across multiple token keyset groups, duplicate-input rejection, and an initial request with no callback returning `pixel_not_observed` without reserving the impression. A subsequent request after a matching callback can be authorized if the remaining checks pass and the impression is still available. After authorization, changed output amounts, blinded messages, or output order are rejected; a retry with refreshed NIP-98 authentication returns the exact stored Cashu signature, including after a restart. Cashu signing fixtures must cover the transaction-wide message and both signatures in the first input's serialized witness, as detailed in [FLOW.md](FLOW.md#sig_all-settlement).

Callback fixtures must include an observation received before the first authorization request, a restart between observation and authorization, and delayed authorization without callback expiry. Repeated callbacks must not create additional payable impressions or release an issued authorization binding.

## 4. Delivery without status messages

The bidder submits an offer without expecting a ROB receipt, outcome, or rejection event. In particular, no message tells the bidder that its bid was unused because of timeout or early closure, and no ROB event announces early closure. Relay acceptance does not establish that the publisher received, validated, or selected the bid. NIP-01's `OK` message reports relay acceptance or rejection, not the publisher's auction decision. [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md).

If a bid is missed or unused, the bidder can attempt recovery of unspent proofs after its refund deadline, following FLOW.md. This includes timeout and early-closure cases. Receipt of a status message is not a condition for recovery, and `closes_at` does not make funds refund-eligible.

Proposed implementation rules to settle alongside the schemas:

- Publishers establish bid subscriptions before announcing opportunities.
- Participants retain the evidence and payment state they need locally; later relay retrieval is not assumed.
- The publisher forwards original signed evidence needed by the oracle rather than relying on event-ID lookup.
- Duplicate deliveries represent one logical bid and preserve the original offer and funding. Rewrapping the same rumor changes the outer event ID, so deduplication cannot rely solely on gift-wrap IDs. The inner rumor ID and bid nonce are available after unwrapping; exact deduplication keys, nonce-conflict handling, and proof-reuse detection remain to be defined.
- Auction deadlines are enforced by the publisher even if a relay delivers an old event.

## 5. Oracle authorization payload

**Agreed 2026-09-22:** the HTTPS authorization payload includes the full bidder commitment: `bidder_pubkey`, `creative_hash`, `payment_hash`, and `sig`. Forward these values unchanged. The oracle recomputes both hashes from the supplied original token and HTML, rejects mismatches, and verifies the commitment using the refund key extracted from the token.

The authorization payload omits `amount_sat`. The oracle derives the gross authorized amount from the sum of the decoded proof amounts in `payment`. The publisher still checks the bidder-to-publisher declared amount against that total; this omission does not remove the amount requirement from the bid payload. See [FLOW.md: Publisher requests oracle authorization](FLOW.md#6-publisher-requests-oracle-authorization).

The minimal payload proposal with these agreed choices is:

```ts
type AuthorizationRequest = {
  request: SignedBidRequest;
  payment: string;
  bid_nonce: string;
  creative: {
    content: string;
    width: number;
    height: number;
  };
  commitment: {
    bidder_pubkey: string;
    creative_hash: string;
    payment_hash: string;
    sig: string;
  };
  outputs: Array<{
    amount: number;
    B_: string;
  }>;
};
```

`SignedBidRequest` denotes the complete original signed kind-`28300` event with the [minimum signed request content](#minimum-signed-request-content) defined above. `payment` and `creative.content` preserve the original token and HTML strings. The oracle derives `bid_request_id` from the event's `id` and `impression_id` from its content, and fixes the creative type to `html`. `bid_nonce` follows the [identifier format](#identifier-formats), and `creative.width` and `creative.height` must be positive safe integers matching a `banner_sizes` entry. The callback observation comes from the oracle's own records.

**Agreed 2026-09-22:** swap inputs are derived from the token instead of receiving a duplicate proof array. Traverse the token's keyset groups and each group's proofs in their encoded array order, without sorting, regrouping, or silently deduplicating them. Duplicate inputs are rejected. The publisher uses the same input order for its signature and mint submission. Mint-authenticated keyset-ID resolution remains publisher-owned; resolved keyset IDs are not required to compute the oracle's `SIG_ALL` signature.

**Agreed 2026-09-22:** an otherwise valid initial request with no recorded matching callback returns an immediate, retryable `pixel_not_observed` result, without holding the request open or reserving the impression. The publisher can retry after the callback arrives. An exact retry of an already issued authorization returns the existing authorization. HTTP status codes and the error-envelope schema remain open. These responses belong to the publisher-to-oracle API and do not add bidder status messages.

**Agreed 2026-09-22:** recorded callbacks are durable and have no automatic expiry in the MVP. An observation remains available after a restart or delay before the first authorization request, subject to all other checks. Callback cleanup is deferred; issued authorization bindings remain permanent. See [FLOW.md: Pixel observation](FLOW.md#5-publisher-renders-the-winning-creative).

The `outputs` entries describe the ordered output signing data, not complete mint-ready blinded-message objects. **Agreed 2026-09-22:** after authorization, changes to output amounts, blinded messages, or output order are rejected, even for the same bid and proofs. Persist the original ordered outputs and signature with the authorization record before returning it. Exact retries return that stored signature. See [FLOW.md](FLOW.md#one-authorized-bid-per-impression) and [ADR-0009](docs/adr/0009-fixed-authorized-swap-outputs.md).

**Agreed 2026-09-22:** the publisher validates the proposed outputs and payment, including output points, duplicate outputs, supported amounts/denominations, balance, and fees. The oracle performs the API parsing and deterministic signing-data construction needed for authorization without repeating those payment-validity checks. Its signature does not certify mint acceptance. See [FLOW.md: Oracle MVP validation boundary](FLOW.md#oracle-mvp-validation-boundary).

### Authorization success response

**Agreed 2026-09-22:** the successful response contains only the oracle's Cashu spending signature:

```json
{
  "signature": "<64-byte-Cashu-Schnorr-signature-as-128-hex-characters>"
}
```

The publisher verifies this signature against the oracle payment key using the exact same `SIG_ALL` swap digest, produces its own spending signature, and places both in the first input's serialized JSON `witness`. It does not add either signature to the original committed `payment` token. The oracle response is not a mint issuance signature, the bidder's commitment signature, or a complete mint-ready transaction. See [FLOW.md: SIG_ALL settlement](FLOW.md#sig_all-settlement).

**Agreed 2026-09-22:** spending-signature representations and construction follow Cashu NUT-00 and NUT-11 directly, without a separate ROB canonicalization profile. The oracle and publisher must use compatible Cashu serialization so the mint receives the same signing message. ROB's creative/payment commitment remains a separate construction.

API payload limits, HTTP error/status details, the remaining NIP-98 profile details, and the remaining wire-schema details still require agreement before this is an interoperable API.

### Oracle HTTP authentication

**Agreed 2026-09-22:** the authorization endpoint uses [NIP-98](https://github.com/nostr-protocol/nips/blob/master/98.md). The publisher sends a signed kind-`27235` event as base64-encoded event JSON in the `Authorization: Nostr <base64-event>` HTTP header. This event is separate from both the bidder's commitment and the publisher's later Cashu spending signature; it is not published to a relay.

The oracle verifies the authentication event's Nostr event ID and signature and requires its `pubkey` to equal the `pubkey` of the independently validated original signed bid-request event. It checks the NIP-98 `u` tag against the exact absolute authorization URL, including query parameters, and the `method` tag against the HTTP method, and enforces timestamp freshness.

ROB additionally requires a `payload` tag containing the SHA-256 hash of the exact transmitted authorization body bytes, represented in hexadecimal. Verify the hash without parsing and reserializing JSON for hashing. NIP-98 itself recommends including this tag and permits server-side validation; ROB makes both mandatory so the publisher approves the specific commitment, payment, creative, context, and outputs. The authentication event is carried in the header and is not included in the body being hashed.

Authentication must succeed before the oracle creates an authorization binding or releases a signature. The original publisher-signed bid request alone is not authorization to select a particular bid, and authentication by another valid Nostr key is insufficient. The pixel endpoint remains unauthenticated. See [FLOW.md](FLOW.md#6-publisher-requests-oracle-authorization) and [ADR-0008](docs/adr/0008-nip98-oracle-authorization.md).

**Agreed 2026-09-22:** accept an authentication event when `abs(oracle_now - created_at) <= 60`, using Unix seconds from the oracle's clock at receipt. A valid authentication event may be reused for an identical HTTP request while it remains within that window; it is not a single-use credential. A later retry carries fresh NIP-98 authentication and, for the same already authorized bid and swap, returns the stored payment signature. Authentication is checked on retries too; freshness expiry does not remove an existing payment-authorization binding. These bounds and reuse rules are ROB's explicit profile of NIP-98's timestamp guidance.

Duplicate-tag handling, public URL reconstruction behind proxies, endpoint method/path, and HTTP error schema remain open. Retry freshness checks remain distinct from payment-authorization idempotency.

## 6. Next decisions

1. **Minimum auction request:** domain syntax/normalization, exact optional ads.txt extension syntax and lookup/cache rules, and additional compatibility fields. The minimum request schema, nested `oracle` object, and `banner_sizes` fields are agreed. `site.domain` is required; `device` is optional with viewer IPs, geographic coordinates, and persistent device identifiers excluded from public requests. Ads.txt seller verification is an optional bidder participation rule. The `user` object is outside v1. V1 offers exactly one website impression with a nonempty list of accepted fixed sizes and supports HTML banners only. The shared rendering profile permits JavaScript in an isolated iframe; its precise capabilities and isolation rules remain open.
2. **Identifier fixtures:** cover the agreed formats, exact case-sensitive comparison, malformed values, and preservation on retransmission. The request ID, impression ID, and bid nonce formats are defined above.
3. **Discovery and delivery:** relay selection, request subscriptions by kind/author, gift-wrap subscriptions by recipient, and final inner routing/reference tags. Additional payload discovery tags are deferred.
4. **Wire schemas:** remaining bid names, nesting, types and versioning, numeric common request/bid size limits, their byte-counting boundaries, publisher-advertised smaller bid limits, and unknown-field handling. Common maximums and optional lower advertised limits are agreed. `closes_at` is an agreed upper bound in integer Unix seconds; early selection is allowed, with collection and stopping policy left to implementations.
5. **Keys and signatures:** publisher identity-to-payment-key binding, oracle service identity binding, remaining NIP-98 tag/URL rules, recipient-key selection and encryption version. The commitment context uses RFC 8785/JCS as defined in FLOW.md. Publisher authentication at the oracle uses NIP-98 with a required verified body hash and an agreed 60-second freshness window either side of the oracle clock, allowing reuse while fresh. Bidders choose how to verify the trusted oracle binding before funding; no shared oracle attestation/discovery protocol is required in v1. The fresh refund-key signer, BIP-340 signature scheme, tagged digest, signed Nostr identity and creative dimensions, and exact UTF-8 HTML creative hashing are agreed.
6. **Validation and retries:** remaining eligibility rules, malformed and late bids, duplicate events, nonce conflicts, proof-reuse detection, and exact retransmission deduplication. Multiple independent immutable bids per bidder and publisher-defined ranking/ties are agreed.
7. **Kind registration:** publish the agreed experimental kind definitions once the schemas are settled.
8. **Examples and fixtures:** complete request/bid examples, encryption and commitment test vectors, and invalid cases.

The oracle MVP authorizes swaps only and returns its Cashu spending signature using NUT-00/NUT-11 representations. Ordered outputs are fixed once authorized, and exact retries return the stored signature; payment validity belongs to the publisher. API payload limits remain open in FLOW.md. First-price pricing and the refund-key commitment design are agreed. The 2026-09-16 commitment decision supersedes the earlier proposal to sign the standalone commitment with the bidder's Nostr identity key.
