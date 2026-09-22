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
| [0007](0007-oracle-local-authorization.md) | Keep payment validity with the publisher |
| [0008](0008-nip98-oracle-authorization.md) | Authenticate oracle authorization requests with NIP-98 |
| [0009](0009-fixed-authorized-swap-outputs.md) | Keep authorized swap outputs fixed |
| [0010](0010-server-side-publisher.md) | Run publisher auctions and settlement on the server |
| [0011](0011-javascript-in-isolated-iframes.md) | Support JavaScript banners inside isolated iframes |
| [0012](0012-local-publisher-payment-recovery.md) | Keep publisher payment recovery in local SQLite |
| [0013](0013-auction-keys-and-local-funding-validation.md) | Accept funding with auction-specific payment keys and local validation |
| [0014](0014-freeze-selection-before-delivery.md) | Freeze the publisher's selection before exposing the creative |
