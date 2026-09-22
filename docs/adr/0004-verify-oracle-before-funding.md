# Verify the oracle independently before funding

A publisher-signed request can name two distinct payment keys controlled by the publisher, defeating the intended oracle check if a bidder accepts that declaration alone. Bidders must independently authenticate the oracle identity, payment key, and pixel endpoint as belonging to an oracle they trust before locking funds, accepting that an opportunity with no verifiable trusted binding cannot receive their funded bid. V1 lets bidders choose how to establish that binding, including trusted local configuration, and requires no shared oracle attestation/discovery protocol; authenticating an oracle does not prove honest behavior or actual rendering.

Agreed on 2026-09-21. The protocol requirement is in [FLOW.md: Bidders evaluate the opportunity](../../FLOW.md#2-bidders-evaluate-the-opportunity).
