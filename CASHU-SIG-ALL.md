# Cashu SIG_ALL review for the oracle MVP

Reviewed 2026-09-22. Research and implementation guidance; this note does not adopt new ROB requirements. Accepted behavior remains in [FLOW.md](FLOW.md#sig_all-settlement), [NOSTR.md](NOSTR.md#5-oracle-authorization-payload), and the linked ADRs.

**The accepted signature-only response works.** The oracle can return one Cashu spending signature without contacting a mint. The publisher reconstructs the agreed swap, verifies that signature, adds its own signature, and submits the completed transaction. This review found no Cashu incompatibility in that boundary. Subsequent design decisions adopt Cashu's signing representations directly, without a separate ROB canonicalization profile, and assign output payment validity to the publisher.

## Sources and scope

Cashu sources are pinned to [cashubtc/nuts `8f244be801a7de5811bd230cc4bc78439f4948dc`](https://github.com/cashubtc/nuts/tree/8f244be801a7de5811bd230cc4bc78439f4948dc), dated 2026-09-15. BIP-340 sources are pinned to [bitcoin/bips `acdce4d50c61f81d9ec6534a804b1fb14e84e565`](https://github.com/bitcoin/bips/tree/acdce4d50c61f81d9ec6534a804b1fb14e84e565), dated 2026-09-22. Commit IDs were obtained from GitHub's commit API; source files were fetched at those revisions.

Reviewed NUT-00, NUT-01, NUT-02, NUT-03, NUT-10, the complete NUT-11, relevant NUT-12 provisions, the official NUT-11 vectors, Cashu error codes, and BIP-340 with its reference implementation and vectors. This is a protocol review, not a claim that a particular mint or library implements that revision.

## Accepted ROB boundary

The following choices are already recorded in the specifications:

- Swap-only authorization over HTTPS, with body-bound NIP-98 from the original request publisher. Authentication permits a timestamp difference of at most 60 seconds in either direction and reuse while fresh.
- Full bidder commitment and unchanged original token/HTML; the oracle derives the gross amount and input list. It preserves encoded keyset-group and proof-array order and rejects duplicate inputs.
- Local authorization checks and an observed matching pixel. Funding authenticity, keyset-unit validation, spendability, mint interaction, and mint-authenticated keyset resolution belong to the publisher.
- Payment validity also includes output-point validity, duplicate outputs, denominations, balance, and fees. The oracle parses and serializes the supplied signing data without duplicating those publisher wallet checks.
- Missing callback on an otherwise valid initial request returns `pixel_not_observed` immediately without reserving the opportunity.
- One authorized bid per opportunity; ordered output signing data becomes fixed upon authorization. Exact retries return the stored signature, including after restart and with refreshed HTTP authentication.
- Success returns only `{ "signature": "<128 hexadecimal characters>" }`.
- Cashu spending-signature representations follow NUT-00 and NUT-11 directly; no separate ROB canonicalization profile is introduced.

Sources: [oracle boundary](FLOW.md#oracle-mvp-validation-boundary), [authorization exclusivity](FLOW.md#one-authorized-bid-per-impression), [API](NOSTR.md#5-oracle-authorization-payload), [ADR-0007](docs/adr/0007-oracle-local-authorization.md), [ADR-0008](docs/adr/0008-nip98-oracle-authorization.md), [ADR-0009](docs/adr/0009-fixed-authorized-swap-outputs.md).

## What is signed

For the swap path, construct one text string by appending each input's original `secret` and hexadecimal `C`, then each output's decimal `amount` and hexadecimal `B_`, preserving transaction order. SHA-256 its UTF-8 bytes and pass the resulting digest to the Schnorr signer. No separators or additional transaction serialization are inserted. The official swap vector supplies the complete text and expected digest. [NUT-11 swap vector](https://github.com/cashubtc/nuts/blob/8f244be801a7de5811bd230cc4bc78439f4948dc/tests/11-test.md#sig_all-test-vectors).

Conceptual construction using Cashu's representations:

```text
inputText  = concat(input.secret + hex(input.C) for input in orderedInputs)
outputText = concat(decimal(output.amount) + output.B_ for output in orderedOutputs)
swapDigest = SHA256(UTF8(inputText + outputText))
oracleSignature = BIP340Sign(oraclePaymentPrivateKey, swapDigest)
```

BIP-340 accepts a message byte array and produces a 64-byte signature. Its internal tagged hashes belong to the signature algorithm; they are not instructions to add another application hash. Compressed public keys can be converted to x-only verification keys by dropping the prefix after validating the key. [BIP-340 signing and key conversion](https://github.com/bitcoin/bips/blob/acdce4d50c61f81d9ec6534a804b1fb14e84e565/bip-0340.mediawiki#default-signing).

The three signature purposes must remain distinct:

| Signature | Key | Application message |
| --- | --- | --- |
| Bid commitment | Bidder refund key | ROB's `ROB/commitment/v1` tagged digest |
| HTTP authorization | Publisher Nostr identity | NIP-98 event ID, binding URL, method, time, and body |
| Cashu spending | Oracle and publisher payment keys, separately | Cashu swap digest above |

Using the ROB commitment digest as the Cashu message, or adding the ROB tag to the swap digest, produces a different signature. The accepted constructions are in [FLOW.md](FLOW.md#commitment-digest-and-signature) and [NOSTR.md](NOSTR.md#oracle-http-authentication).

## Signature placement and payment conditions

The official multisignature swap vector puts all signer signatures in the first input's `witness`, encoded as a JSON string. It does not put a separate signature on every input or on outputs. Therefore ROB's response can be a single oracle signature; the publisher supplies the other one and constructs the witness. [NUT-11 vectors](https://github.com/cashubtc/nuts/blob/8f244be801a7de5811bd230cc4bc78439f4948dc/tests/11-test.md#sig_all-test-vectors).

```ts
inputs[0].witness = JSON.stringify({
  signatures: [oracleSignature, publisherSignature],
});
```

Cashu requires every `SIG_ALL` input to share its kind, locking `data`, and `tags`; different nonces are permitted. Reject duplicate recognized tags, invalid thresholds, unknown signature flags, and duplicate keys within a spending pathway. Key identity ignores compressed-key parity and hex case. Distinct valid signing keys count toward a threshold, rather than the number of signature strings. [NUT-11](https://github.com/cashubtc/nuts/blob/8f244be801a7de5811bd230cc4bc78439f4948dc/11.md#signature-flag-sig_all).

ROB additionally requires the precise 2-of-2 publisher/oracle payment path, one refund key, its threshold of one, and the agreed common deadline. A mathematically valid signature is insufficient when those conditions are wrong. [ROB payment conditions](FLOW.md#lock-and-refund-path).

At the mint's `now <= locktime`, the original payment path applies. At `now > locktime`, refund keys enable an additional spending path; the original path survives. Without refund keys, expiry unlocks the proof. Missing or invalid locktime is treated as a permanent lock. [NUT-11 locktime](https://github.com/cashubtc/nuts/blob/8f244be801a7de5811bd230cc4bc78439f4948dc/11.md#locktime-tag).

Consequently, authorization cannot reserve funds or prevent a later refund race. ROB must reject malformed refund conditions rather than assume that an oracle signature repairs them. [ROB settlement/refunds](FLOW.md#7-publisher-completes-settlement).

## Token, keysets, outputs, and mint responsibilities

V4 encodes proof groups in arrays and curve points as CBOR byte strings; mint APIs use hexadecimal strings. A current abbreviated keyset ID is the first eight bytes of a full ID and requires wallet-side resolution. Legacy `00` keyset IDs are themselves eight bytes; do not interpret every eight-byte ID as an abbreviated modern ID. [NUT-00 V4](https://github.com/cashubtc/nuts/blob/8f244be801a7de5811bd230cc4bc78439f4948dc/00.md#v4-tokens), [NUT-02 keyset versions](https://github.com/cashubtc/nuts/blob/8f244be801a7de5811bd230cc4bc78439f4948dc/02.md#deriving-the-keyset-id).

Input amounts and input/output keyset IDs do not enter the `SIG_ALL` message. Neither do the mint URL, witnesses, DLEQ data, or ROB context. This follows directly from its field list. [NUT-11 aggregation](https://github.com/cashubtc/nuts/blob/8f244be801a7de5811bd230cc4bc78439f4948dc/11.md#aggregation-for-swap).

Thus the oracle can extract signing material without resolving keysets. The publisher still constructs complete mint inputs/outputs and preserves committed amounts and proofs. “Fixed swap” in the oracle API means fixed ordered signing data and ROB evidence, not a signature over every possible mint-request field. A signature-only response does not change this Cashu limitation. [ROB validation boundary](FLOW.md#oracle-mvp-validation-boundary).

Mint keysets associate denominations with public keys and units. The publisher needs that information to validate funding and prepare settlement; it is not needed for the oracle's spending signature. [NUT-01](https://github.com/cashubtc/nuts/blob/8f244be801a7de5811bd230cc4bc78439f4948dc/01.md#keyset-generation).

Only active keysets may issue outputs. Input fees are accumulated per input and rounded up: `fees = (sum(input_fee_ppk) + 999) // 1000`; settlement requires `sum(inputs) - fees == sum(outputs)`. Inactive input keysets differ from expired keysets, whose final expiry may end the mint's obligation. These are publisher/mint checks under ROB's accepted boundary. [NUT-02](https://github.com/cashubtc/nuts/blob/8f244be801a7de5811bd230cc4bc78439f4948dc/02.md#fees).

All swap inputs and outputs must share a currency unit. NUT-03 recommends sorting outputs by amount for privacy; any sorting must occur before ROB authorization so both parties sign the eventual order. The mint processes the swap and returns issuance signatures, which are distinct from these spending signatures. [NUT-03](https://github.com/cashubtc/nuts/blob/8f244be801a7de5811bd230cc4bc78439f4948dc/03.md).

Output secrets are hidden in blinded messages. The oracle cannot infer from `B_` alone that the publisher knows the secret and blinding factor. NIP-98 establishes publisher approval of the submitted output data; it is not proof of that knowledge. Publisher-side durable output preparation is therefore essential when replacement outputs are forbidden. [NUT-10 output conditions](https://github.com/cashubtc/nuts/blob/8f244be801a7de5811bd230cc4bc78439f4948dc/10.md#basic-components), [ADR-0009](docs/adr/0009-fixed-authorized-swap-outputs.md).

Keep the original committed token unchanged, including optional DLEQ data, for ROB hashing. Construct a separate mint transaction. NUT-12 says the entire `dleq` field **SHOULD** be removed from mint inputs: `e`/`s` or `r` can link issuance to redemption. Its optional offline authenticity check needs `e`, `s`, `r`, and the corresponding mint public key; it does not establish spend state. The oracle is not a receiving wallet and ROB does not require it to perform DLEQ verification. [NUT-12](https://github.com/cashubtc/nuts/blob/8f244be801a7de5811bd230cc4bc78439f4948dc/12.md#user-to-user-dleq-in-proof), [ROB token preservation](NOSTR.md#payment-hash-and-original-token-preservation).

Mint support for the chosen spending conditions must be established by the participants responsible for funding; unsupported conditions can otherwise be treated as ordinary tokens. NUT-10 also requires unique input secrets and string-valued secret tags. [NUT-10](https://github.com/cashubtc/nuts/blob/8f244be801a7de5811bd230cc4bc78439f4948dc/10.md).

## Cashu encoding adoption

ROB adopts NUT-00/NUT-11 spending-signature representations directly. The earlier proposal for an additional ROB lowercase-hex/decimal canonicalization profile is not adopted. NUT-00 specifies SEC1 compressed-point bytes for point `hex_str` values; NUT-11 signs the actual secret, hex, and amount strings. Implementations must preserve a consistent signing message through token decoding, oracle authorization, publisher signing, and mint submission, and test their Cashu serialization against the upstream vectors. This is implementation conformance work, not a new ROB encoding decision. [NUT-00 encodings](https://github.com/cashubtc/nuts/blob/8f244be801a7de5811bd230cc4bc78439f4948dc/00.md#byte-operations-and-encodings), [NUT-11 aggregation](https://github.com/cashubtc/nuts/blob/8f244be801a7de5811bd230cc4bc78439f4948dc/11.md#aggregation-for-swap).

## Remaining implementation-profile decisions

These are recommendations, not newly accepted requirements:

1. **Condition handling:** conform to Cashu's uniform-condition, duplicate-tag, threshold, and key rules without rewriting original secrets. Explicitly reject malformed transport data before extracting signing material; implementation fixtures should exercise those Cashu requirements.
2. **API parsing and limits:** define API field types, exact numeric handling, and payload/resource limits. Cashu defines spending-signature encodings. Output payment-validity checks, including curve-point validity, duplicate outputs, denominations, balance, and fees, are publisher-owned following the design decision recorded in [FLOW.md](FLOW.md#oracle-mvp-validation-boundary). Cashu's duplicate-output and balance errors concern mint acceptance and do not create additional oracle responsibilities. [Cashu error codes](https://github.com/cashubtc/nuts/blob/8f244be801a7de5811bd230cc4bc78439f4948dc/error_codes.md).
3. **Retry identity:** define equality over the original commitment/evidence and ordered output data, independently of HTTP JSON whitespace or the refreshed NIP-98 event. The Cashu digest alone cannot identify a ROB authorization because it omits ROB context. A commitment digest versus exact commitment-signature-byte comparison also needs an explicit choice.
4. **Persistence:** commit the opportunity binding, relevant evidence, ordered outputs, oracle key identity, and exact returned signature before releasing it. Do not return an uncommitted competing signature. Authentication remains mandatory on retries; callback expiry and key rotation must not erase or silently replace an issued authorization. Recovering a transaction whose response was lost should not require another pixel callback. These follow the accepted durability and exact-retry behavior; storage design remains open.

BIP-340 permits different valid signatures for the same message because auxiliary randomness can vary. Regenerating a signature is therefore not equivalent to returning the accepted cached bytes. Use a production cryptographic implementation with correct nonce handling; the Python reference used below is a research verifier. [BIP-340 signing](https://github.com/bitcoin/bips/blob/acdce4d50c61f81d9ec6534a804b1fb14e84e565/bip-0340.mediawiki#default-signing).

## Verification performed

Fetched the pinned official files into a temporary research directory and ran the official [BIP-340 reference verifier](https://github.com/bitcoin/bips/blob/acdce4d50c61f81d9ec6534a804b1fb14e84e565/bip-0340/reference.py). All **19 official BIP-340 vectors** passed. Independently reconstructed the Cashu swap messages from the JSON blocks in [the official NUT-11 vectors](https://github.com/cashubtc/nuts/blob/8f244be801a7de5811bd230cc4bc78439f4948dc/tests/11-test.md#sig_all-test-vectors).

Results:

- Reproduced the published single-input swap digest: `de7f9e3ca0fcc5ed3258fcf83dbf1be7fa78a5ed6da7bf2aa60d61e9dc6eb09a`.
- Verified every supplied signature in all five P2PK swap examples, including both signatures in the multisignature and expired-refund examples. The mixed-condition example's signature also verifies mathematically, while its input conditions differ and make the transaction invalid. Structural checks cannot be replaced by signature verification.
- Confirmed rejection after double-hashing the digest, adding secret whitespace, changing `C`/`B_` hex case, or changing an output amount.
- Confirmed that changing input amount or input/output keyset IDs leaves the spending signature valid. This checks signature coverage, not mint acceptance.

No live mint was called. This validates the signing interpretation and published vectors, not proof authenticity, settlement success, or an oracle implementation.

## Proposed ROB conformance fixtures

Before implementation interoperability is claimed, add fixtures for:

- A complete signed ROB request, witness-free V4 token, HTML, commitment, observed callback, NIP-98 request, and one returned oracle signature; independently verify the publisher/oracle witness.
- Multiple inputs across multiple token groups, two outputs, and distinct nonces; preserve group/proof order. Reject reordered inputs/outputs, substitutions, omissions, repeated secrets, and mixed locking/tag conditions.
- Exact preimage/digest bytes, Unicode secrets, JSON transport escapes, hex case, amount boundaries, and rejection of accidental double hashing or ROB-tagged Cashu messages.
- First-input serialized witness placement, two distinct payment signers, invalid/missing signatures, and rejection of a refund commitment used as a spending signature.
- Refund behavior immediately before, at, and after locktime under a controlled mint clock; the oracle authorization record remains bound throughout.
- Original-token preservation while removing DLEQ only from mint inputs; modern short/full IDs and legacy IDs; unsigned-field mutations treated as publisher/mint checks rather than imagined Cashu signature coverage.
- Missing callback without reservation; concurrent competing bids and output sets; crashes before persistence, after persistence, and after a lost response; fresh NIP-98 retries returning identical cached signature bytes.
- Malformed API fields at the oracle boundary; invalid/duplicate payment outputs and fee-related preparation in publisher tests, with full settlement fixtures deferred until bidder/publisher adapters exist.

These fixture proposals combine the accepted ROB invariants with the source constraints above; they are not assertions that the complete wire format is already specified.
