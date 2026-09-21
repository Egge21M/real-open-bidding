# Real Open Bidding

Shared terminology for ROB auctions and bids.

## Language

**Bid request ID (`bid_request_id`)**:
The stable identifier of an auction's exact published bid request, shared by all bids and payment authorizations for that auction.
_Avoid_: `request_id`, `request_reference`, `requestReference`, auction ID

**Impression ID (`impression_id`)**:
The identifier of one offered ad opportunity within a bid request. Together with `bid_request_id`, it identifies that opportunity across ROB.

**Bid nonce (`bid_nonce`)**:
A bidder-generated identifier that distinguishes a bid for an offered opportunity. Together with `bid_request_id` and `impression_id`, it identifies that bid's pixel callback.
