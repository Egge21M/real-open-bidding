# Treat additional offers as independent immutable bids

ROB attaches locked funding and a creative/payment commitment to each bid, so replacing an offer would require defining what happens to the earlier offer and its still-locked funds. A bidder may instead submit multiple independent, immutable bids for one opportunity, each with a fresh bid nonce, refund key, and separate funding, while retransmissions preserve the original bid. This keeps the existing two-message protocol and refund mechanism usable without an amendment or withdrawal operation, at the cost of locking additional funds for each additional offer until they are spent or recovered.

Agreed on 2026-09-21. The protocol requirements are in [FLOW.md: Bidder sends a prepaid response](../../FLOW.md#3-bidder-sends-a-prepaid-response).
