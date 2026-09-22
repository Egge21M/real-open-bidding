# Keep payment validity with the publisher

The oracle MVP verifies the commitment and local authorization conditions, observes the matching pixel callback, and authorizes a publisher-supplied spend without contacting the mint. Payment validity belongs to the publisher, including funding authenticity, keyset-unit validation, spendability, output points and duplicates, denominations, balance, and fees; this avoids duplicating wallet responsibilities in the oracle while accepting that its signature does not certify a valid payment. The oracle still parses signing data deterministically and enforces its durable one-authorized-bid rule, and the mint enforces the completed spend.

Agreed on 2026-09-22. The responsibility boundary is in [FLOW.md: Oracle MVP validation boundary](../../FLOW.md#oracle-mvp-validation-boundary).
