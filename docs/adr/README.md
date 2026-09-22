# Architectural decision records

This directory holds ROB's architectural decision records. Follow the [domain documentation rules](../agents/domain.md) when adding or consuming a decision.

| ADR | Decision |
| --- | --- |
| [0001](0001-one-authorized-bid-per-impression.md) | Authorize at most one bid per offered impression |
| [0002](0002-independent-immutable-bids.md) | Treat additional offers as independent immutable bids |
| [0003](0003-publisher-controlled-early-selection.md) | Permit publisher-controlled early selection without bidder status messages |
| [0004](0004-verify-oracle-before-funding.md) | Verify the oracle independently before funding |
| [0005](0005-reuse-site-and-device-context.md) | Reuse OpenRTB Site and Device for advertising context |
| [0006](0006-optional-seller-authorization.md) | Make ads.txt seller authorization optional for bidders |
