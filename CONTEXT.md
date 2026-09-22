# Real Open Bidding

Shared terminology for ROB auctions and bids.

## Language

**Publisher**:
The party offering website banner opportunities, selecting bids, and collecting the proceeds of settled bid payments.

**Inventory**:
The website banner opportunities a publisher makes available for bidding.

**Placement**:
A reusable location for banners on a publisher's website, such as a sidebar. Each new ad load for a placement offers a separate impression through its own bid request.

**Bid request**:
A publisher's announcement inviting funded offers for one offered website banner opportunity and declaring the terms under which it accepts them.

**Auction**:
The publisher-controlled process of collecting and evaluating bids for an offered ad opportunity and selecting a bid for rendering.

**Site context (`site`)**:
The publisher-declared description of the website where a banner opportunity is offered, including its page, publisher, and surrounding content.

**Device context (`device`)**:
The publisher-declared description of the viewer's device and browser environment for an offered banner opportunity.

**Seller authorization**:
A website's declaration that a publisher's Nostr identity is permitted to offer inventory for its domain.

**Bid request ID (`bid_request_id`)**:
The stable identifier of an auction's exact published bid request, shared by all bids and payment authorizations for that auction.
_Avoid_: `request_id`, `request_reference`, `requestReference`, auction ID

**Publisher payment key**:
The publisher's Cashu signing key named by a bid request, required alongside the oracle's payment key to spend a bid through the publisher payment path.

**Bid collection deadline (`closes_at`)**:
The upper time bound for receiving bids, with bids received at or after it considered late. It does not guarantee that the publisher is still considering bids before that time.

**Impression ID (`impression_id`)**:
The identifier of one offered ad opportunity within a bid request. Together with `bid_request_id`, it identifies that opportunity across ROB.

**Accepted banner sizes**:
The width-and-height alternatives a publisher offers for one website banner opportunity, measured in CSS pixels. The alternatives describe one opportunity, not separate impressions.

**Bid creative size**:
The single width-and-height pair a bidder commits to for its creative, chosen from the request's accepted banner sizes.

**Rendering profile**:
The shared contract for supported creative features and execution constraints that bidders and publishers rely on when preparing and rendering a banner.

**Bid nonce (`bid_nonce`)**:
A bidder-generated identifier that distinguishes a bid for an offered opportunity. Together with `bid_request_id` and `impression_id`, it identifies that bid's pixel callback.

**Bid**:
An immutable, independently funded offer to display a bidder's creative for one offered ad opportunity, including the amount offered and its creative/payment commitment. Multiple bids from the same bidder are separate offers.

**Bid retransmission**:
Another delivery of an existing bid with its offer, funding, and commitment unchanged.

**Bid selection**:
The publisher's choice of an eligible bid for rendering according to its own ranking and tie-breaking policy.

**Creative/payment commitment**:
The bidder's approval binding its creative, funding, named bidder identity, and bid context together.

**Oracle identity binding**:
The association between an oracle's identity, its payment key, and its pixel endpoint, authenticated independently of the publisher's declaration.

**Pixel callback**:
A request received by the oracle at the pixel URL associated with a bid. It is a delivery signal and does not establish that the creative was displayed or viewable.

**Payment authorization**:
The oracle's approval for the publisher to spend a bid's locked funds in a particular spending transaction. Authorization precedes settlement and does not certify funding authenticity, current spendability, or completed payment.

**Settlement**:
The mint's completed processing of an authorized bid payment, making its proceeds available to the publisher.

**Refund eligibility**:
The condition in which the bidder may attempt to recover a bid's unspent funds after its chosen deadline. Eligibility does not itself recover funds or disable an authorized publisher payment.

**Refund**:
A completed recovery of a bid's unspent funds by the bidder.
