# ROB protocol lab

A standalone React + TypeScript + Vite application for interactively exploring the complete Real Open Bidding lifecycle. It models the agreed semantics in the repository as of 2026-09-22. It is not a wallet, live auction, cryptographic verifier, or interoperable protocol implementation.

## Run

From the repository root, using the pinned Bun version:

```sh
bun install --frozen-lockfile
bun run dev:demo
```

Open the local URL printed by Vite (normally `http://localhost:5174`). The production bundle is static and uses no backend:

```sh
bun run build:demo
bun run preview:demo
```

Use localhost or HTTPS; the real SHA-256 demonstrations use Web Crypto. Fonts are bundled locally. Opening the app does not make relay, oracle, seller-authorization, mint, pixel or external asset requests. Specification links open GitHub only when followed.

## Explore

- Play, pause, step backward/forward, scrub the timeline, restart, or jump to the final state. Space toggles playback and the arrow keys step when focus is outside an interactive control. Changing speed affects playback only, not the simulated clock.
- Jump between the nine protocol chapters or expand the complete event trace. Backward navigation displays immutable snapshots; it does not reverse a real payment.
- Select one of twelve scenarios, or use **Change conditions** to combine selection policies, early closure, seller policy, oracle trust, malformed bids, changed evidence, callback ordering, independent deadlines, mint outages, and post-expiry races.
- Inspect each step's explanation, expandable validation checks, illustrative message payload, original bid, decoded proof conditions, oracle binding, and funds ledger.
- The HTML hash experiment lets you edit a decoded HTML string and compare real SHA-256 hashes. Even an added newline invalidates an unchanged commitment. Invalid Unicode is rejected.
- Export a complete JSON trace of the current conditions, artifacts, events and snapshots. Scenario presets also have URLs such as `?scenario=refund-race`. Custom condition combinations are captured in the export.

The viewer preview is schematic. It does not execute the committed HTML or fetch its pixel. The inspector is an omniscient teaching view: bidders do not receive the publisher's rejection, selection, or outcome information in the actual protocol.

## Modeled requirements

| Specification | Behavior represented |
| --- | --- |
| [FLOW: request and advertising context](../../FLOW.md#1-publisher-publishes-a-bid-request), [ADR 0005](../../docs/adr/0005-reuse-site-and-device-context.md) | One website impression, required `site.domain`, optional standard `device`, excluded `user` and prohibited public device data; two CSS-size alternatives for the same opportunity. The signed request envelope supplies `bid_request_id`. Changing signed content changes its event hash. |
| [FLOW: trust](../../FLOW.md#2-bidders-evaluate-the-opportunity), [ADRs 0004](../../docs/adr/0004-verify-oracle-before-funding.md) and [0006](../../docs/adr/0006-optional-seller-authorization.md) | Mandatory independent oracle binding before funding; optional ads.txt participation policy never becomes a protocol validity, settlement or refund condition. |
| [FLOW: funded bids](../../FLOW.md#3-bidder-sends-a-prepaid-response), [ADR 0002](../../docs/adr/0002-independent-immutable-bids.md) | Two bidders make three independent immutable offers with distinct nonces, refund keys, and funding. A retransmission preserves its offer; later bids never replace earlier ones. |
| [NOSTR: gift wrapping](../../NOSTR.md#gift-wrapped-transport) | Public `28300`; unsigned `28301` rumor → bidder-signed `13` seal → one-use-signed `21059` wrap. Only the outer wrap is published. Recipient metadata is public; bidder/auction metadata is encrypted. Transport identity and refund-key authorization have separate roles. |
| [FLOW: auction](../../FLOW.md#4-publisher-runs-the-auction), [ADR 0003](../../docs/adr/0003-publisher-controlled-early-selection.md) | Gross/net/creative publisher policies, first-price integer sats per impression, per-mint redemption fees borne by publisher, timely receipt strictly before `closes_at`, early selection and unused timely bids, no ROB status notices. |
| [FLOW: payment and commitment](../../FLOW.md#payment-conditions) | Single accepted mint, sat keysets, exact proof totals, 2-of-2 P2PK and `SIG_ALL`, same single refund key/deadline in every proof, original witness-free token preservation, exact UTF-8 hashes, signed dimensions, tagged digest, and fresh refund-key commitment separate from identity and spend signatures. |
| [FLOW: rendering and oracle](../../FLOW.md#5-publisher-renders-the-winning-creative) | Exact HTML, completed pixel URL, callbacks before/after authorization requests, missing callback failure, exact proof-input matching, tampered evidence rejection, and original-evidence retry. A publisher-triggered callback demonstrates the viewability limitation. |
| [FLOW: exclusivity](../../FLOW.md#one-authorized-bid-per-impression), [ADR 0001](../../docs/adr/0001-one-authorized-bid-per-impression.md) | One persistent commitment and original proofs before signature release; exact retries reuse it. Repeated callbacks add nothing. Competing requests, timeout, failed settlement, expiry and refunds cannot replace the binding. Atomicity is modeled by a synchronous state transition; real durable storage is outside this app. |
| [FLOW: settlement and recovery](../../FLOW.md#7-publisher-completes-settlement) | Authorization, both signatures and mint completion are distinct. `SIG_ALL` covers the same ordered inputs and outputs. Fee accounting, no premature refund, active bidder recovery, both race outcomes, consumed-proof rejection, outages and retries. |

The UI notes also explain accepted but unfinished rendering-profile and message-size decisions, privacy and asset-hash boundaries, and the remaining wire/identity/transport work. OpenRTB and Prebid reference documents are not treated as additional ROB requirements.

## Simulation choices, not additional protocol rules

- Cashu tokens, keys, mint issuance, spend witnesses, BIP-340 signatures, NIP-44 ciphertext and transport checks use explicit fixtures/placeholders. They are not valid funds or cryptographic test vectors. Alteration checks compare against retained fixture artifacts; this is not general-purpose token, HTML, or public-request validation.
- SHA-256 string hashing, the NIP-01 event ID construction and the tagged commitment digest construction use real hash operations. **Context encoding is still unspecified by ROB.** The demo's JSON array for `Encode(...)` is only an illustrative local encoding; field names/nesting still under discussion are labeled throughout the inspector.
- No unagreed numeric payload ceilings, rendering capability profile, sandbox contract, ads.txt syntax, or discovery scheme is presented as normative. Unsupported/request data examples are fixtures, not a complete wire-schema validator.
- The three offers are A1 (12 sats, mint A, 1-sat redemption fee), B1 (14 sats, mint B, 4-sat fee), and A2 (10 sats, mint A, 1-sat fee). Net ranking selects A1; gross and tall-creative policies select B1. Ties use bid ID. Fees are illustrative, not live mint quotes.
- Example receipt times are t+4, +5 and +7 seconds. `closes_at` is t+12; optional early selection is t+6. The local publisher requires five seconds of settlement margin. ROB fixes neither these timings nor a minimum/maximum lock duration.
- Default locktimes are t+45, +50 and +55. The simulated mint considers expiry at `now > locktime`. Clock advancement only enables a refund; a separate action consumes unspent proofs. Refund fees are zero for transparent example accounting.
- The demo illustrates a swap, with publisher-controlled outputs, without choosing ROB's eventual swap/melt operation or output-validation contract. Its retry policy only reuses an identical transaction.
- Simulated transport faults are applied to a received copy while the bidder retains its original issued funding for recovery. That does not imply an invalid genuine token can be repaired by editing proofs.

## Validation and layout

```sh
bun run test:demo
bun run --filter @rob/protocol-demo typecheck
bun run --filter @rob/protocol-demo lint
bun run build:demo
```

`tests/protocol.test.ts` tests the end-to-end branches, authorization exclusivity in both competing request orders, exact input/output binding, expiry and race rules, immutable snapshots, exact-string hashing and request identity. A configurable trace matrix checks value conservation, monotonic time, irreversible proof consumption and retained authorization at every event.

`src/protocol/` is independent of React: fixtures construct the illustrative evidence, model functions enforce transitions, and the simulation orchestrator produces immutable snapshots. Components render those snapshots. The responsive UI supports local horizontal scrolling for the participant map, native modal focus trapping, keyboard controls, reduced-motion preferences, and text explanations for diagram state.
