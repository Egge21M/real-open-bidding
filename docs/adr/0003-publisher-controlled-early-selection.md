# Permit publisher-controlled early selection without bidder status messages

ROB broadcasts bid requests to an open set of bidders, so a publisher cannot establish that every potential bidder has finished responding. `closes_at` is an upper bound on timely receipt, and the publisher may select earlier and proceed through the existing rendering and payment checks, with collection and stopping behavior left to its implementation. V1 retains its two-message protocol without rejection, timeout, or early-closure notifications, accepting that bidders may lock funds for an opportunity that is already unavailable and must recover unused funds through the ordinary refund path.

Agreed on 2026-09-21. The protocol requirements are in [FLOW.md: Publisher runs the auction](../../FLOW.md#4-publisher-runs-the-auction) and [NOSTR.md: Delivery without status messages](../../NOSTR.md#4-delivery-without-status-messages).
