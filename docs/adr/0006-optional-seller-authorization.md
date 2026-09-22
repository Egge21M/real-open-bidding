# Make ads.txt seller authorization optional for bidders

ROB specifies an ads.txt extension through which a website can authorize publisher Nostr identities to sell its inventory. Publication and enforcement are optional, allowing bidders to choose whether a verified listing is a prerequisite for their participation without making website verification a protocol funding or settlement condition. A missing or unverified listing therefore does not invalidate an otherwise valid request; the separate requirement to verify a trusted oracle before funding still applies.

Agreed on 2026-09-22. The protocol policy is in [FLOW.md: Optional seller authorization](../../FLOW.md#optional-seller-authorization); entry syntax and retrieval details remain in the [extension draft](../../ADS-TXT-NOSTR.md).
