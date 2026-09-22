# Authorize at most one bid per offered impression

ROB receives independently funded bids for an offered impression, so validating each bid and its callback separately would allow several different bids for the same opportunity to become payable. For each `(bid_request_id, impression_id)`, the oracle durably binds payment authorization to at most one bid commitment and its original funding, with no switch to another bid after authorization is issued. This preserves payment exclusivity across retries and failures at the cost of losing fallback revenue when settlement fails, because an issued authorization can remain usable even after the bidder becomes eligible for a refund.

Agreed on 2026-09-21. The protocol requirements are in [FLOW.md: One authorized bid per impression](../../FLOW.md#one-authorized-bid-per-impression).
