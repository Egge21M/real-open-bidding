# Authenticate oracle authorization requests with NIP-98

The oracle's first payment authorization permanently binds an impression to one bid, so an unauthenticated caller could consume that choice even though the payment lock prevents it from spending without the publisher. The authorization endpoint therefore requires NIP-98 signed by the original bid request's publisher, with a mandatory verified body hash, preserving publisher control of bid selection at the cost of signing each authorization request. Reusing the publisher's Nostr identity binds its approval to the ROB evidence and swap outputs without changing Cashu payment conditions; pixel callbacks remain public.

Agreed on 2026-09-22. Requirements are in [FLOW.md](../../FLOW.md#6-publisher-requests-oracle-authorization), with HTTP authentication details in [NOSTR.md](../../NOSTR.md#oracle-http-authentication).
