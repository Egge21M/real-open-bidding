# Real Open Bidding: protocol flow

Status: POC specification draft. This document records the agreed flow; wire formats and the [open questions](#details-still-to-specify) remain to be defined.

**Real Open Bidding (ROB) is a fully open, prepaid, decentralised, trust-minimised real-time bidding protocol built on Nostr and Cashu ecash.**

A publisher announces an ad opportunity and its accepted Cashu mints on Nostr. Each bidder responds with a creative and locked ecash from one accepted mint. The publisher selects and renders a bid, obtains its declared oracle's payment authorization, and claims the ecash at that bid's issuing mint. Unspent bids have a bidder-chosen refund deadline.

**V1 supports HTML banners only.** Bidders submit the complete HTML markup as a string, with the oracle pixel already included. The [creative scope](#v1-creative-scope) defines this boundary; the broader OpenRTB and Prebid references do not expand v1's supported formats.

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
    B->>B: Choose an accepted mint; prepare locked ecash with refund deadline
    B->>B: Insert pixel, then sign commitment with fresh refund key
    B->>P: Creative, amount, locked ecash, and commitment
    Note over B,P: Multiple bidders can respond
    P->>P: Validate bids and select winner
    P->>V: Render winning creative unchanged
    V->>O: Request embedded pixel URL
    O->>O: Record callback for the bid
    P->>O: Creative, ecash, commitment, proposed spend, and bid context
    O->>O: Check commitment, payment, pixel URL, and callback
    alt All checks pass
        O-->>P: Return partially signed spend
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

The bid arrow is a logical message carried through Nostr relays using NIP-59 ephemeral gift wrapping: a `28301` bid rumor inside a `13` seal and a published `21059` wrap. Publisher-to-oracle transport remains open, with HTTPS recommended. The bidder obtains and prepares funding before submitting its response. Callback and authorization-request arrival may occur in either order.

## 1. Publisher publishes a bid request

The publisher describes an HTML banner opportunity in an OpenRTB-like request and publishes it through Nostr relays. In addition to the advertising information, the request contains:

- The publisher's payment public key.
- A nonempty `mints` array of Cashu mint URLs accepted by the publisher.
- The chosen oracle's identity and payment public key.
- The oracle's pixel base URL, `oracle_pixel_base`.
- A unique request/auction ID, `request_id`, and the opportunity's `impression_id`.

The publisher discloses its accepted mints and oracle before bidders commit funds. Each bidder chooses one listed mint. The refund deadline is chosen by each bidder, not assigned by the request. Auction requests use experimental ephemeral kind `28300` with JSON in `content`; complete schemas and discovery rules remain open. [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) supplies the underlying publication/subscription mechanism.

## 2. Bidders evaluate the opportunity

Bidders subscribe to requests and evaluate the opportunity, publisher, accepted mints, and oracle before deciding whether to participate. The publisher need not contact every bidder individually, and subscribing does not commit a bidder to an offer.

## 3. Bidder sends a prepaid response

The bidder prepares ecash under the [payment conditions](#payment-conditions) with a fresh refund key for this bid, inserts the [oracle pixel](#pixel-url) into its creative, then uses that refund private key to sign a [commitment](#creativepayment-commitment) covering the completed creative's hash, the exact token, its Nostr identity, and the bid context. The commitment uses BIP-340 Schnorr; the Nostr identity key signs the transport seal.

The response includes the creative, the gross bid amount in sats per impression, a `payment` string containing a Cashu V4 token (`cashuB…`) with exactly matching locked ecash, and the signed commitment. The token identifies the bidder's selected mint, which must be accepted by the request's `mints`; proofs from multiple mints cannot be combined in one bid. The original token contains no spending witnesses and is preserved unchanged for commitment verification. Funding is supplied before rendering, but the publisher cannot claim it alone. The bidder retains the token, proofs, and refund private key for recovery.

## 4. Publisher runs the auction

The publisher validates bids and selects a winner locally. It checks the mint, `sat` keysets, proof total, locking keys, refund conditions, and remaining settlement time. It verifies the commitment against the refund key extracted from the proofs and checks that the signed bidder identity matches the authenticated Nostr sender. It accounts for redemption costs and may reject bids with insufficient time under its own acceptance policy. Deadlines can differ between bids in the same auction.

ROB always uses first-price pricing: the winner pays its full bid amount before redemption fees. The request carries no auction-type field. Its `closes_at` field is an absolute Unix timestamp in seconds; bids received by the publisher at or after that time are late. The selection algorithm, auction duration policy, and tie-breaking remain open. Winning alone does not unlock payment.

## 5. Publisher renders the winning creative

The publisher renders the winning HTML banner payload unchanged, including the bidder-inserted pixel. It does not inject tracking code or substitute placeholders after signing.

In the intended flow, the viewer's browser requests the pixel over HTTP. The oracle records the callback by request ID, impression ID, and bid nonce. It can record callbacks before receiving the authorization request and match them later; no bidder registration or extra publisher-to-oracle coordination message is required.

## 6. Publisher requests oracle authorization

The publisher submits:

- The exact original `payment` token string and commitment signed with the bid's refund key.
- The original creative payload for hashing.
- The proposed Cashu spending transaction, including its outputs.
- The original request and bid context, including the signed bidder Nostr public key, needed to verify the commitment and check the pixel URL.

The oracle:

1. Decodes and validates the token and its proofs, including their payment conditions. Requires the same single refund public key in every proof and derives the commitment verification key from it. A key supplied separately by the publisher is not a substitute.
2. Hashes the exact original token string with SHA-256 over its UTF-8 bytes and compares the lowercase hex result with the signed `payment_hash`, without re-encoding the token for hashing.
3. Hashes the submitted creative, reconstructs the bid context, and verifies the BIP-340 commitment signature using the extracted refund key. The signed Nostr public key is part of the message, not the verification key. The commitment establishes authorization by the refund-key holder; it does not by itself prove that the named Nostr identity sent the bid.
4. Checks that the proposed spending transaction uses exactly those committed proofs at the committed mint, without substituting, omitting, duplicating, or adding inputs. Matching a separately submitted token is insufficient if the transaction's inputs differ.
5. Checks the embedded pixel URL against the declared base URL, request/impression IDs, and signed bid nonce.
6. Finds a recorded callback matching that URL.

Only after all checks pass does the oracle sign and return the proposed spend. A callback for one bid must not authorize another bid or payment, and repeated callbacks are not additional payable impressions. An absent callback prevents authorization even if the creative was displayed. Transaction signing is described under [SIG_ALL settlement](#sig_all-settlement).

## 7. Publisher completes settlement

The publisher adds its signature to the same transaction and submits it to the issuing mint. Payment completes when the mint processes the spend, not when signatures are collected. The publisher bears redemption fees under the [amount rules](#amount-and-redemption-fees).

To avoid competition from a refund, settlement must complete before locktime expiry. Signatures do not reserve funds or extend the deadline. The publisher chooses its settlement schedule and safety margin; ROB fixes neither.

## 8. Bidder recovers unspent funds

After the mint considers a bid's locktime expired, the bidder can sign a refund spend with its refund key and submit its retained proofs. No publisher or oracle signature is needed. This covers losing, rejected, failed, and abandoned bids, including unsettled winning bids. Losing an auction does not enable an earlier refund, and expiry does not automatically transfer funds.

The original publisher/oracle path remains valid after expiry. A late settlement and refund can race; successful mint processing determines which spend completes. Consumed proofs cannot subsequently fund the other path. Mint outages can delay recovery. [NUT-11: Refund MultiSig](https://github.com/cashubtc/nuts/blob/main/11.md#refund-multisig).

## Payment conditions

### Amount and redemption fees

The POC uses **`sat` only**. A bid amount is a positive integer expressing the face value offered for **one impression**, before redemption fees. Fractional sats, `msat`, and other units are excluded.

All attached proofs must come from the `sat` keysets of the single accepted mint selected by the bidder, with:

```text
bid_amount_sat = sum(attached_proof.amount)
```

A wrong mint, wrong unit, or amount mismatch invalidates the bid. Validate the unit against the keysets; a token's stated unit alone is insufficient. [NUT-00: Proof](https://github.com/cashubtc/nuts/blob/main/00.md#proof), [NUT-01: Currency Units](https://github.com/cashubtc/nuts/blob/main/01.md#supported-currency-units).

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

`data` and `pubkeys` supply the publisher and oracle's two distinct payment keys. Cashu requires compressed public keys. The commitment verifier derives a BIP-340 x-only key from the refund public key as described below; it does not map the bidder's Nostr identity to a Cashu key. Publisher/oracle identity-to-payment-key binding remains open. The condition is serialized inside `Proof.secret` before mint issuance, not added by editing an issued proof. [NUT-11](https://github.com/cashubtc/nuts/blob/main/11.md), [NUT-10](https://github.com/cashubtc/nuts/blob/main/10.md).

The `refund` key is required: NUT-11 expiry without refund keys makes proofs anyone-can-spend. With it, expiry enables the alternative refund path and retains the original payment path. The mint's clock determines expiry. [NUT-11: Locktime Tag](https://github.com/cashubtc/nuts/blob/main/11.md#locktime-tag).

### SIG_ALL settlement

Both parties sign the same transaction-wide message. For a swap, `SIG_ALL` covers ordered input `secret` and mint signature `C` values, followed by output `amount` and blinded-message `B_` values. All inputs must share the required kind, locking data, and tags; witnesses go on the first input. Signing inputs alone would not implement this flow. A melt also includes quote-related signing data. [NUT-11: SIG_ALL](https://github.com/cashubtc/nuts/blob/main/11.md#signature-flag-sig_all).

A swap can turn the jointly authorized inputs into fresh proofs under publisher control. The publisher prepares blinded outputs accounting for the redemption fees and includes them in the oracle-signing request. The mint consumes valid inputs and signs the new outputs. Its issuance signatures are distinct from the publisher/oracle spending signatures. The exact swap/melt operation ROB standardizes, output-control checks, and retries remain open. [NUT-03](https://github.com/cashubtc/nuts/blob/main/03.md).

## Creative and verification

### V1 creative scope

**Agreed 2026-09-16:** v1 supports HTML banner creatives only. The bid supplies the complete HTML markup as a string, including the completed oracle pixel URL, before the refund-key commitment is signed. In the proposed bid schema this is `creative.type: "html"` and `creative.content: <HTML string>`; `html` is the only supported v1 creative type and the value used for `creativeType` in the commitment context.

Requests describe HTML banner inventory, and publishers reject bids for other media types or payload formats. Native asset objects, VAST/video/audio creatives, URL-only creative responses such as `adUrl`, and separate custom-renderer payloads are outside v1. An HTML banner may reference external images; supplying a URL instead of the required HTML body does not satisfy this format. The existing commitment boundary for bidder-hosted assets still applies.

The bidder completes the markup and inserts the pixel before signing. The publisher does not substitute macros, add tracking markup, or modify the submitted HTML after signing. Integrations that prepare or transform markup must finish that work before the bidder commits to it.

Banner dimensions and compatibility fields, markup size limits, allowed HTML/CSS/JavaScript, and renderer isolation remain to be specified. Choosing HTML banners does not settle those rules or the number of impressions per request. Final JSON field names and nesting remain part of the wire-schema work. The [HTML creative hash](#html-creative-hash) is defined below.

### Pixel URL

The bidder inserts the pixel **when creating the bid, before hashing and signing**. A reusable template may have a placeholder, but the submitted creative contains the completed URL:

```text
{oracle_pixel_base}/{request_id}/{impression_id}/{bid_nonce}
```

The request supplies the base URL and request/impression IDs. The bidder generates a fresh, unique `bid_nonce` to distinguish bids for the same impression. It is separate from the Cashu proof nonce and is not secret. Append URL-encoded identifier path segments to a base URL without a trailing slash, query string, or fragment.

```html
<img src="https://oracle.example/pixel/request-123/imp-1/bid-456" width="1" height="1" alt="">
```

The full URL is covered by the creative hash. The POC uses this single convention; method negotiation and verification profiles are outside its scope.

### Creative/payment commitment

**Agreed 2026-09-16:** one commitment is signed with the bid's fresh refund private key using **BIP-340 Schnorr over secp256k1**. The bidder's Nostr public key is signed data. No additional standalone commitment signature from the Nostr identity key or authorization in the token memo is required.

#### Signing key and authorization

The verification key comes from the `refund` condition in the committed proofs. Every proof must carry the same single refund key and the required ROB payment conditions. Parse and validate that 33-byte compressed secp256k1 public key, then use its 32-byte x-coordinate for BIP-340 verification. NUT-11 compares key identity by x-coordinate, ignoring the `02`/`03` parity prefix. Preserve the original secret strings and token; key comparison does not permit rewriting them. [NUT-11: Public Key Canonicalisation](https://github.com/cashubtc/nuts/blob/main/11.md#public-key-canonicalisation), [BIP-340](https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki).

This authenticates the refund-key holder's approval of the creative, payment, named bidder identity, and bid context. The publisher cannot authorize a replacement creative merely by supplying another identity key and signing a replacement commitment: verification still requires the refund key embedded in the proofs. Changing that embedded key invalidates the mint's proof. A valid commitment signature does not replace validation of the proofs' genuineness, spend state, or payment conditions.

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

After preparing the locked ecash as a Cashu V4 token and inserting the pixel, the bidder hashes the complete original creative payload and the exact payment token string. The payment hash retains its existing definition:

```text
payment_hash = lowercase_hex(SHA256(UTF8(payment)))
```

Hash the bare original `cashuB…` string, including its prefix, without JSON quotation marks, surrounding whitespace, or a `cashu:` URI prefix. Do not decode and re-encode the token before hashing. Every encoded field, including any optional DLEQ data or memo, is covered. The token contains no spending witnesses; later spending signatures are added to a separate transaction built from decoded proofs. Equivalent tokens with different serializations can have different hashes, so proof-reuse checks must inspect their decoded proofs.

#### Commitment digest and signature

The agreed construction is:

```text
paymentHash = SHA256(UTF8(payment))
creativeHashBytes = SHA256(UTF8(creative.content))
contextHash = SHA256(Encode(
    requestReference,
    impressionId,
    bidNonce,
    creativeType
))

message = paymentHash || creativeHashBytes || bidderPublickeyBytes || contextHash
tagHash = SHA256(UTF8("ROB/commitment/v1"))
digest = SHA256(tagHash || tagHash || message)
signature = BIP340Sign(refundPrivateKey, digest)
```

`||` means byte concatenation. Each of the four components of `message` is exactly 32 bytes, in the displayed order. `paymentHash` is the raw digest, equivalent to hex-decoding `payment_hash`; `creativeHashBytes` is the decoded 32-byte creative hash; `bidderPublickeyBytes` is the decoded 32-byte x-only Nostr public key. Hash the byte values, not their hex text. Reject malformed or wrong-length values.

The tag is exactly the UTF-8 string `ROB/commitment/v1`, without quotes or a terminator. The construction is BIP-340-style tagged hashing and separates ROB commitments from other messages signed with the refund key. Pass the resulting 32-byte `digest` directly to the BIP-340 signing/verification API; do not add another application-level hash. The signature is 64 bytes, represented as 128 lowercase hexadecimal characters in JSON. The ROB tag labels the commitment construction; it does not settle the auction payload's version field. [BIP-340: Tagged Hashes](https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki#design).

`Encode(...)` remains unspecified. The exact request reference, context serialization, and final JSON field names/nesting must still be defined before producing interoperable wire messages or complete test vectors. The context must identify the original request, its impression, the bid nonce, and the creative type; verification must also match the original signed request, publisher/oracle payment keys, accepted mint, and gross amount against the token and bid. These checks cannot be replaced by accepting a publisher-supplied context hash.

#### Transport identity, privacy, and spending

The publisher authenticates the Nostr sender through the NIP-59 seal and requires that sender's key, the rumor's key, and the Nostr key inside the signed commitment to match. The refund-key commitment alone does not prove that the named Nostr identity participated. It provides independently verifiable authorization from the refund-key holder to the oracle; Nostr delivery authentication and payment authorization have distinct roles.

Fresh refund keys keep the bidder's stable identity out of its refund conditions. In ordinary settlement the mint receives proofs and Cashu spending witnesses, not the ROB commitment or its named Nostr identity. The publisher and oracle see the identity-to-payment association; this is not a claim of complete unlinkability or protection against their disclosure of that association. The memo remains optional token metadata and supplies no independent authorization. [Cashu swap request](https://github.com/cashubtc/nuts/blob/main/03.md#example).

The commitment signature is kept outside the token and its spending witnesses. It adds no third settlement signer and cannot serve as a refund-spend authorization: actual settlement and refund signatures cover the Cashu transaction under `SIG_ALL`. The bidder retains the fresh refund private key for later recovery. Changes to the bidder's own hosted assets are outside this commitment's threat model; no dependency hashes or asset manifest are required for the POC. The commitment authenticates the approved payload/payment association, not what was displayed.

## Trust model and POC limits

The publisher controls the auction. Payment depends on its declared oracle correctly checking the signed commitment, payment, pixel URL, and callback. A publisher can request the pixel directly while displaying another creative or nothing at all, even without oracle collusion. Publisher–oracle collusion can bypass the checks entirely.

The pixel is a delivery signal, not proof of rendering or viewability. Stronger verification is outside the POC's scope. The design also does not establish independently verifiable auction fairness.

The mint must enforce spending conditions and honor its ecash. Refund eligibility limits how long the bidder must wait before attempting recovery; it does not guarantee immediate recovery or prevent a competing publisher spend after expiry.

## Details still to specify

These are open questions, not additional protocol decisions:

| Area | Remaining work |
| --- | --- |
| Message formats | OpenRTB field reuse; remaining ROB keys, nesting, references, amount, pixel base URL, and identifiers. HTML banner markup as a string is the only v1 creative format; the request's `mints` array and bid's V4 token `payment` string are agreed. |
| HTML banners | Dimension and compatibility fields, markup size limits, allowed HTML/CSS/JavaScript, and renderer isolation. Other media types and URL-only creative responses are outside v1. |
| Transport | Relay discovery, final inner bid tags, gift-wrap interoperability, duplicates, and publisher-to-oracle transport. Request kind `28300` and NIP-59 ephemeral wrapping of bid kind `28301` are agreed. |
| Identity and keys | Publisher/oracle identity-to-payment-key binding, recipient-key selection, oracle contact/discovery, and key changes. Refund-key commitment verification and the separate Nostr sender check are agreed. |
| Auction rules | Auction duration policy, selection, and ties; first-price pricing and `closes_at` in Unix seconds are agreed. |
| Cashu validation | Mint capability checks; genuine, unspent proofs with the required mint, unit, amount, and lock; prevention of proof reuse across bids. |
| Signed commitment | Context serialization and request reference, final JSON schema, and replay/deduplication rules. Fresh refund-key BIP-340 signatures, the tagged digest construction, signed bidder identity, exact-token payment hashing, and exact UTF-8 HTML creative hashing are agreed. |
| Callback handling | Retention/expiry, duplicates, binding a callback to one committed payment, and late-arrival retries. |
| Joint signing | Exact swap/melt operation, transaction construction, output control, and retry behavior. |
| Refund implementation | Scheduling, mint outages, pending spends, and retries. |

## Technical references

HTML banners as the sole v1 creative format were agreed on 2026-09-16 after reviewing Prebid's media-specific payloads. The decision covers inline HTML markup and the existing bidder-inserted pixel flow; other creative formats are deferred.

Exact HTML creative hashing was agreed on 2026-09-17: SHA-256 over the UTF-8 encoding of the decoded HTML string, without normalization, with invalid Unicode rejected. Referenced asset contents remain outside the hash.

The initial design was described on 2026-09-08. The pixel flow, bidder-chosen refund deadline, and initial amount/mint/fee rules were agreed on 2026-09-10. First-price pricing, `closes_at` in Unix seconds, and a publisher-provided list of accepted mints with one selected mint per bid were agreed on 2026-09-15. Fresh refund-key BIP-340 commitments with the bidder identity as signed data and a tagged digest were agreed on 2026-09-16; this supersedes the earlier identity-key commitment proposal. Sources were checked on 2026-09-08, with NUT-11 locktime/refund and NUT-00/NUT-01 amount/unit rules checked on 2026-09-10, and BIP-340, NUT-11 key rules, and NUT-03 swap inputs checked on 2026-09-16. Exact revisions should be pinned for the wire specification.

- [OpenRTB reference](OPENRTB.md): advertising message concepts.
- [Nostr NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md): events, keys, relays, and subscriptions.
- [Cashu NUT-00](https://github.com/cashubtc/nuts/blob/main/00.md): proofs and tokens.
- [Cashu NUT-01](https://github.com/cashubtc/nuts/blob/main/01.md): keysets and units.
- [Cashu NUT-10](https://github.com/cashubtc/nuts/blob/main/10.md): spending-condition secrets.
- [Cashu NUT-11](https://github.com/cashubtc/nuts/blob/main/11.md): P2PK, multisignature conditions, locktime, and `SIG_ALL`.
- [Cashu NUT-03](https://github.com/cashubtc/nuts/blob/main/03.md): swapping proofs for fresh ecash.
- [BIP-340](https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki): Schnorr signatures over secp256k1, x-only public keys, and tagged hashes.
