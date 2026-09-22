# Run publisher auctions and settlement on the server

The publisher needs private signing keys, a wallet, and recoverable payment state to collect proceeds from funded bids. The default implementation runs auctions and settlement in a server-side module with a small browser SDK for ad configuration, auction requests, and rendering, keeping publisher credentials and payment recovery on publisher-controlled infrastructure at the cost of requiring a server deployment. The browser receives the selected creative before payment completes so its embedded pixel can reach the oracle; this implementation choice preserves the existing distinction between selection, payment authorization, and settlement.

Agreed on 2026-09-22. The responsibility split is in [FLOW.md: Default publisher architecture](../../FLOW.md#default-publisher-architecture); the agreed standalone Bun server and SDK design is in [PUBLISHER.md](../../PUBLISHER.md).
