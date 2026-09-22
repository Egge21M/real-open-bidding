# Prebid auction completion research

Research date: 2026-09-21. Source baseline: official Prebid documentation and Prebid.js commit [`382e41b7714b744d9db78ee7ef1aab596e266290`](https://github.com/prebid/Prebid.js/commit/382e41b7714b744d9db78ee7ef1aab596e266290), retrieved from upstream HEAD. This is a source snapshot, not a claimed release version. This note informs ROB's selection-timing discussion; it does not adopt new protocol requirements.

## What ends a Prebid.js auction

The public `requestBids` contract calls `bidsBackHandler` when responses are complete or the configured timeout is reached. The handler receives collected bids, a timeout flag, and the auction identifier. Consequently, the timeout is not a mandatory minimum waiting period. [API contract](https://docs.prebid.org/dev-docs/publisher-api-reference/requestBids.html).

The pinned implementation makes the completion condition more precise:

- `startAuctionTimer` schedules `executeCallback(true)`.
- Normal completion requires the relevant adapter requests to have called `adapterDone`, plus zero outstanding bids still being processed. Finishing a request does not require a positive bid: missing responses produce `NO_BID` events.
- Video/audio caching can keep bid processing outstanding. The `responsesReady` hook can delay adapter completion. These conditions gate normal completion; the timeout is a separate path.
- With no valid bidder requests, completion is immediate.
- `executeCallback` marks the auction complete and emits `AUCTION_END`, then invokes the publisher callback through `bidsBackCallback`, an asynchronous hook. Auction completion and callback execution are therefore distinct internal steps.

Sources: [`startAuctionTimer`, `executeCallback`, `auctionDone`, and `callBids`](https://github.com/prebid/Prebid.js/blob/382e41b7714b744d9db78ee7ef1aab596e266290/src/auction.ts#L245-L325); [`responsesReady` and `auctionCallbacks`](https://github.com/prebid/Prebid.js/blob/382e41b7714b744d9db78ee7ef1aab596e266290/src/auction.ts#L499-L620).

## Publisher control and final selection

Publishers can shorten the configured timeout. They can also configure `auctionOptions.secondaryBidders`: Prebid does not wait for those bidders before completing the auction. The source applies that exclusion only when at least one request belongs to a nonsecondary bidder; marking every bidder secondary does not make the waiting set empty. This provides explicit early-completion control relative to the full bidder set. [Auction options](https://docs.prebid.org/dev-docs/publisher-api-reference/setConfig.html#auction-options), [implementation](https://github.com/prebid/Prebid.js/blob/382e41b7714b744d9db78ee7ef1aab596e266290/src/auction.ts#L568-L595).

The timeout RTD module additionally computes timeout adjustments from configured or remotely supplied rules before bid requests. That is timeout configuration, not a rule that closes a running auction upon receiving a sufficiently attractive bid. [Module documentation at the pinned revision](https://github.com/prebid/Prebid.js/blob/382e41b7714b744d9db78ee7ef1aab596e266290/modules/timeoutRtdProvider.md).

In the usual integration, Prebid supplies targeting values and the publisher's ad server makes the final display decision. Calling `bidsBackHandler` is not itself selecting the final displayed ad. [Ad-server integration overview](https://docs.prebid.org/features/adServerKvps.html#overview). The official no-ad-server example instead calls `getHighestCpmBids` and `renderAd` from publisher code after the callback. [No-ad-server example](https://docs.prebid.org/dev-docs/examples/no-adserver.html).

Publisher page code also controls when it calls the ad server. The official basic example uses an independent timer to invoke the same ad-server function as the callback, with a duplicate-call guard. This shows that the integration can proceed independently of normal Prebid completion; it is not evidence of a public API that terminates Prebid's internal auction on any chosen bid. [Basic example](https://docs.prebid.org/dev-docs/examples/basic-example.html), [failsafe versus auction timeouts](https://docs.prebid.org/features/timeouts.html).

## Implications for ROB and subsequent decision

ROB cannot copy the known-request completion test: a public bid request has no complete bidder roster. Requiring every auction to wait until `closes_at` would therefore remove Prebid's normal early-completion opportunity.

The comparison supports treating publisher-defined early selection as a latency/revenue tradeoff, with `closes_at` clearly identified as an upper bound rather than a promise of availability until that instant. Bidders may then lock funds for an opportunity already assigned.

**ROB decision following this research, 2026-09-21:** early selection is allowed, while collection, stopping policy, and handling of unused bids are publisher implementation details. V1 has no bidder-facing rejection, timeout, or early-closure messages; unused funds follow the existing refund path. Selection, payment authorization, and settlement remain distinct, and all existing callback and payment checks still apply. See [ADR-0003](docs/adr/0003-publisher-controlled-early-selection.md) and the current requirements in [FLOW.md](FLOW.md#4-publisher-runs-the-auction); the accepted [one-authorized-bid decision](docs/adr/0001-one-authorized-bid-per-impression.md) continues to prevent switching the payable bid after authorization.
