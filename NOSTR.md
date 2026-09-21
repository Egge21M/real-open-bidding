# Real Open Bidding: Nostr events

Status: working design draft, started 2026-09-15; refund-key commitment design agreed 2026-09-16. This document records agreed transport decisions and proposals for discussion. Experimental event kinds are assigned; complete wire schemas remain to be defined.

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
| Auction request | Public broadcast from publisher to listening bidders. |
| Bid request ID | `bid_request_id` is the signed `28300` event's `id`, stable across retransmission and used by bids, pixel callbacks, commitments, and payment authorizations. |
| Payment exclusivity | At most one authorized bid commitment per `(bid_request_id, impression_id)`. Retries remain bound to that commitment and its original payment proofs; no switch to another bid after oracle signing. |
| V1 creative scope | HTML banners only, supplied as complete HTML markup strings with the oracle pixel inserted before signing. `html` is the sole v1 creative type; other media formats and URL-only creative responses are excluded. |
| Auction pricing | Always first-price: the winner pays its full bid amount before redemption fees. No `auction_type` field. |
| Auction deadline | Required `closes_at`: integer Unix timestamp in seconds. |
| Accepted mints | Required `mints`: a nonempty array of Cashu mint URLs accepted by the publisher. Each bid uses exactly one listed mint. |
| Bid payment | Required `payment`: a bare Cashu V4 token string beginning with `cashuB`, containing locked proofs from one accepted mint and no spending witnesses. |
| Payment hash | Lowercase hex SHA-256 of the UTF-8 bytes of the exact original `payment` string. Preserve the string through oracle verification. |
| Creative hash | Lowercase hex SHA-256 of the exact UTF-8 HTML string after JSON decoding, including the inserted pixel. No normalization; reject invalid Unicode. Preserve the string through verification and rendering. |
| Commitment signer | The fresh refund key embedded in every proof signs one BIP-340 Schnorr commitment. All proofs have the same single refund key, separate from the bidder's Nostr identity. |
| Commitment contents | Exact-token payment hash, 32-byte creative hash, bidder Nostr public key, and a hash of the bid context, using the `ROB/commitment/v1` tagged digest in FLOW.md. Context encoding remains open. |
| Bidder identity | Signed data in the commitment; must match the seal signer and rumor public key at the publisher. The commitment verification key is extracted from the proofs' refund conditions. No second standalone identity-key commitment signature or memo authorization is required. |
| Bid submission | Directed to the publisher using NIP-59 ephemeral gift wrapping: inner `28301` rumor, signed `13` seal, outer `21059` wrap. |
| Bid status | Omitted for now, including receipt acknowledgements and win/loss notices. |
| Encryption scheme | NIP-44 as used by NIP-59. The exact revision and library compatibility profile remain to be pinned. |
| Publisher–oracle communication | HTTPS is recommended; final transport and API details remain open. No oracle event kinds are proposed here. |
| Oracle authorization endpoint | Configured or discovered separately by the publisher; omitted from the auction request. |
| Numeric kinds | `28300` for public auction requests; `28301` for inner bid rumors. Agreed experimental ROB assignments. The transport reuses NIP-59 kinds `13` and `21059`. |

NIP-01 defines kinds `20000 <= kind < 30000` as ephemeral: relays are not expected to store them. This is a delivery convention, not a confidentiality or deletion guarantee. [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md).

Neither selected kind was listed in the [Nostr kind registry](https://github.com/nostr-protocol/registry-of-kinds/blob/master/schema.yaml) when checked on 2026-09-15. This check does not guarantee absence of use elsewhere. Publish the ROB definitions to the registry once the schemas are settled.

## 2. Auction request

Kind: `28300` (`ROB_AUCTION_REQUEST`).

The publisher signs and broadcasts an HTML banner opportunity. Bidders subscribe to suitable relays and evaluate the publisher, opportunity, accepted mints, and oracle before funding a bid.

### Information to represent

These are semantic requirements and proposed additions; only explicitly agreed field names and identifiers are final.

| Information | Status |
| --- | --- |
| HTML banner opportunity and impression identifier | Required by the flow; dimensions, compatibility fields, and other minimum advertising fields remain open. HTML banners are the only v1 media format. |
| Bid request ID | `bid_request_id` is the signed request event's `id`, obtained from the envelope rather than embedded in its own content. |
| Publisher payment public key | Required by the flow; binding to the Nostr signing identity remains open. |
| Accepted Cashu mint URLs | Required `mints`: a nonempty array of mint URL strings. |
| Oracle identity, payment public key, and pixel base URL | Required by the flow. |
| Protocol version | Proposed. |
| Auction closing time | Required `closes_at`, expressed as an integer Unix timestamp in seconds. |
| Bid-delivery relay information | Proposed; exact relay-selection rules remain open. |

The request does not impose a Cashu refund deadline. Each bidder chooses its own deadline; the publisher decides whether the remaining settlement time is acceptable.

**Agreed 2026-09-21:** `bid_request_id` identifies the auction's exact published bid request. Retransmitting the same signed event preserves this ID; changing its signed contents creates a new event ID and is treated as a new auction. All references must resolve to that original signed request. The pair `(bid_request_id, impression_id)` identifies an offered ad opportunity; `bid_nonce` distinguishes bids for that opportunity. The one-authorized-bid rule is defined in [FLOW.md](FLOW.md#one-authorized-bid-per-impression).

The publisher lists its accepted mints in `mints`, including when it accepts only one. The bidder chooses one listed mint, encoded in the bid's Cashu token. All proofs for that bid must come from that mint's `sat` keysets and total the full bid amount; combining proofs from different mints within one bid is not supported. The chosen mint is bound by the creative/payment commitment. Settlement and refunds use that same issuing mint. The publisher continues to bear redemption fees, which may differ between accepted mints. The request's URL comparison rules remain to be specified consistently with Cashu V4's mint URL rules; never normalize the committed token string during hashing.

The oracle's authorization endpoint is not part of the request. The publisher configures or discovers it separately to obtain a spending signature. Bidders need the declared oracle identity to evaluate participation, its payment key to lock ecash, and its pixel base URL to construct the creative. Publisher–oracle authentication must bind the separately configured service to the declared oracle; its details remain open.

### Pricing and closing time

ROB always uses first-price pricing. A winning 10-sat bid pays 10 sats gross; the publisher receives the value remaining after redemption fees. The request carries no `auction_type` field. Eligibility, selection, and tie-breaking rules remain to be specified.

`closes_at` is an absolute deadline in Unix seconds, using the same time unit as the Nostr envelope's `created_at`. It replaces the previously discussed `closes_at_ms` proposal. For example, `created_at: 1800000000` and `closes_at: 1800000003` describe a closing time three seconds after the stated creation time.

The publisher evaluates timeliness using its own receipt time: a bid received at or after `closes_at` is late. The bidder's event timestamp does not establish timely receipt. Network transit consumes the available bidding window; seconds precision does not compensate for delay or clock differences. This field sets neither a fixed auction duration nor a Cashu refund deadline.

### Proposed envelope

- `pubkey`: the publisher's Nostr signing identity.
- `kind`: `28300`.
- `content`: a JSON-encoded request object.
- `tags`: no ROB discovery tags for now; start with an empty array.
- Other envelope fields and the event signature follow NIP-01.

Public content needs an explicit field allowlist. Reusing OpenRTB concepts must not automatically expose its optional user or device information through public broadcasts. Bidders initially filter by event kind and, optionally, publisher identity, then inspect the JSON payload. Additional discovery tags can be considered later.

## 3. Bid submission

Kind: `28301` (`ROB_BID_SUBMISSION`).

The bidder submits a complete creative and funded offer for an auction. The JSON payload is carried in an unsigned `28301` event (a rumor), sealed by the bidder, and gift-wrapped to the publisher. Only the outer `21059` event is published.

### Information to represent

| Information | Status |
| --- | --- |
| Bid request and impression references | Required `bid_request_id` equals the original signed `28300` event's `id`; impression ID encoding remains open. |
| Fresh bid nonce | Required by the pixel convention in FLOW.md. |
| Complete original HTML banner markup, including the completed pixel URL | Required as a string. `html` is the only v1 creative type. A URL-only response or another media format is invalid. |
| Positive integer gross amount in sats per impression | Required by the flow. |
| Selected mint and locked ecash totaling the bid amount | Required `payment`: a Cashu V4 token string. The token encodes the selected mint, unit, and proofs. |
| Refund-key-signed creative/payment commitment | Required: BIP-340 signature covering the payment hash, creative hash, bidder Nostr identity, and bid context under FLOW.md's tagged digest construction. Final schema and context encoding remain open. |
| Protocol version | Proposed. |

Refund conditions are encoded in the token's locked proofs. The payment field adds no separate mint, unit, proof array, refund deadline, or refund key fields. Generate a fresh refund key per logical bid; every proof must have the same single refund key and `n_sigs_refund` of `1`. Extract the commitment verification key from these proofs.

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
  "version": "0.1",
  "bid_request_id": "<bid-request-event-id>",
  "impression_id": "1",
  "bid_nonce": "<fresh-random-bid-nonce>",
  "amount_sat": 8,
  "creative": {
    "type": "html",
    "content": "<a href=\"https://advertiser.example\"><img src=\"https://advertiser.example/banner.png\" width=\"300\" height=\"250\" alt=\"Example ad\"></a><img src=\"https://oracle.example/pixel/<bid-request-event-id>/1/<fresh-random-bid-nonce>\" width=\"1\" height=\"1\" alt=\"\">"
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
- Decode the V4 token to obtain its mint, unit, and proofs. The mint must be accepted by the request, and both the token's unit and the proofs' keyset units must be `sat`. Resolve token keyset IDs according to Cashu before validating the proofs or constructing a mint transaction.
- Each decoded proof's `secret` preserves the issued P2PK conditions. The refund deadline and fresh refund public key are already encoded there. Require the same single refund key on every proof and derive the BIP-340 verification key from its x-coordinate, following FLOW.md. The bidder's refund private key is never included.
- V4 supports optional DLEQ data for mint-signature verification. Whether ROB requires it on every proof remains a validation-profile decision. Included DLEQ data is part of the hashed token string; it is not stripped before hashing. DLEQ verification does not establish that proofs remain unspent, and its `r` value must not be forwarded to the mint in the eventual spend.
- `commitment.bidder_pubkey` is the bidder's Nostr identity, included as signed data, and must match the authenticated identity from the seal and rumor at the publisher. It is not the commitment verification key. `commitment.sig` is a BIP-340 Schnorr signature verified against the refund key extracted from the proofs. No second standalone commitment signature by the Nostr identity is required. The rumor has no event signature.
- `commitment.payment_hash` binds the exact original token string and therefore its encoded mint, unit, proofs, and any optional data. The signature covers both `creative_hash` and `payment_hash` together with the bid context. Including a hash in the JSON without signing it would not establish the binding.
- The commitment digest combines the payment hash, creative hash, bidder Nostr public key, and context hash as four 32-byte values in that order, under the `ROB/commitment/v1` tag. The context identifies the request through `bid_request_id`, plus the impression, bid nonce, and creative type. The publisher/oracle keys and gross amount must match the original request and committed proofs. The signature scheme, digest construction, creative hashing rules, and `bid_request_id` are agreed; context encoding and the remaining wire schema are open. See [FLOW.md: Commitment digest and signature](FLOW.md#commitment-digest-and-signature).

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

The wrapped payload carries one commitment signed with the fresh refund key. [FLOW.md](FLOW.md#creativepayment-commitment) defines its authorization and tagged BIP-340 digest construction. The commitment and the stable Nostr identity stay outside the token's spending conditions and witnesses; the mint receives the normal Cashu spending transaction. No memo-based authorization is used. An optional memo remains covered by the exact-token hash. The publisher and oracle can see the identity-to-payment association; a fresh refund key avoids putting that stable bidder identity into mint-visible refund conditions. Context serialization and final schemas must still be defined before this event is interoperable.

Before signing a spend, the oracle:

1. Decodes and validates the payment token and all proofs, including their required locking/refund conditions. It extracts the same single refund key from every proof and derives its BIP-340 x-only verification key. A separately claimed verification key cannot override the proofs.
2. Hashes the original token string, recomputes the creative hash and bid context, and verifies the commitment's Schnorr signature with that refund key. The bidder Nostr public key is one of the signed values. Successful signature verification does not replace proof validation.
3. Checks that the proposed transaction spends exactly those proofs at their mint: no substituted, omitted, duplicated, or additional inputs. Compare decoded proof amounts, resolved keyset IDs, original secret strings, and mint signatures `C`; later witnesses are not part of proof identity. Comparing a separate attached token to the commitment is insufficient if the transaction being signed uses different inputs.
4. Applies the remaining request, amount, payment, pixel URL, and callback checks before signing the exact transaction under `SIG_ALL`.
5. Enforces [one authorized bid per impression](FLOW.md#one-authorized-bid-per-impression), atomically persisting the binding from `(bid_request_id, impression_id)` to the commitment and its original payment proofs before releasing a signature. An exact retry returns the existing authorization; a different bid for that opportunity is rejected after authorization has been issued.

The commitment supplies transferable evidence of refund-key authorization; gift wrapping does not make it deniable. Its signature is kept outside the original token and spending witnesses. It is separate from the publisher/oracle settlement signatures and any later refund-spend signature.

Required rejection cases for future conformance fixtures include an identity-key signature in place of the refund-key signature; missing, multiple, or inconsistent refund keys; a mismatch between the signed bidder identity and the authenticated Nostr sender at the publisher; and a changed token/memo, creative hash, identity, context, or domain tag with an unchanged commitment signature. Reject malformed UTF-8, unpaired surrogates in the HTML string, and submitted HTML that does not match the claimed creative hash, including whitespace-only changes. Invalid or unexpected transaction inputs must also be rejected even when the commitment itself verifies.

## 4. Delivery without status messages

The bidder submits an offer without expecting a ROB receipt or outcome event. Relay acceptance does not establish that the publisher received, validated, or selected the bid. NIP-01's `OK` message reports relay acceptance or rejection. [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md).

If a bid is missed or unused, the bidder can attempt recovery of unspent proofs after its refund deadline, following FLOW.md. Receipt of a status message is not a condition for recovery.

Proposed implementation rules to settle alongside the schemas:

- Publishers establish bid subscriptions before announcing opportunities.
- Participants retain the evidence and payment state they need locally; later relay retrieval is not assumed.
- The publisher forwards original signed evidence needed by the oracle rather than relying on event-ID lookup.
- Duplicate deliveries represent one logical bid. Rewrapping the same rumor changes the outer event ID, so deduplication cannot rely solely on gift-wrap IDs. The inner rumor ID and bid nonce are available after unwrapping; exact logical-bid, retransmission, and proof-reuse rules remain to be defined.
- Auction deadlines are enforced by the publisher even if a relay delivers an old event.

## 5. Next decisions

1. **Minimum auction request:** one or multiple impressions, banner dimensions/compatibility fields, and the required advertising context. HTML banners are the sole v1 creative format; markup limits, allowed HTML/CSS/JavaScript, and renderer isolation remain open.
2. **Identifiers:** how impression IDs and bid nonces are encoded. `bid_request_id` is agreed as the signed bid-request event's ID. The bid nonce must remain usable before signing the bid event that contains its pixel URL.
3. **Discovery and delivery:** relay selection, request subscriptions by kind/author, gift-wrap subscriptions by recipient, and final inner routing/reference tags. Additional payload discovery tags are deferred.
4. **Wire schemas:** remaining names, nesting, types, versioning, size limits, and unknown-field handling. `closes_at` is fixed as integer Unix seconds; auction duration policy remains open.
5. **Keys and signatures:** recipient-key selection, publisher/oracle identity-to-payment-key binding, encryption version, and context serialization. The fresh refund-key signer, BIP-340 signature scheme, tagged digest, signed Nostr identity, and exact UTF-8 HTML creative hashing are agreed.
6. **Validation and retries:** malformed and late bids, duplicate events, logical bid identity, proof reuse, and allowed retransmission behavior.
7. **Kind registration:** publish the agreed experimental kind definitions once the schemas are settled.
8. **Examples and fixtures:** complete request/bid examples, encryption and commitment test vectors, and invalid cases.

Swap-based settlement remains a proposal. First-price pricing and the refund-key commitment design are agreed. The 2026-09-16 commitment decision supersedes the earlier proposal to sign the standalone commitment with the bidder's Nostr identity key.
