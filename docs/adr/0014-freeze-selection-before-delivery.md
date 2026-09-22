# Freeze the publisher's selection before exposing the creative

Once a creative reference has reached the browser, a failed response or missing pixel cannot establish whether the creative executed. The default publisher durably fixes its selected bid before exposing that reference and never substitutes another bid for that opportunity afterward, accepting lost fallback revenue to keep browser delivery and payment attempts tied to one selection. This implementation policy is stricter than the protocol's permanent binding at oracle authorization; another auction requires a new explicit ad load.

Agreed on 2026-09-22. The default behavior is in [PUBLISHER.md: Default auction policy](../../PUBLISHER.md#default-auction-policy); the protocol-level exclusivity rule in [ADR-0001](0001-one-authorized-bid-per-impression.md) remains unchanged.
