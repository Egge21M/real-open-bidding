# Keep publisher payment recovery in local SQLite

The publisher can crash after delivering a creative or after the oracle fixes a swap, so payment work and its recovery material must outlive the browser request and server process. The standalone Bun server persists the selected bid, auction payment key recovery information, and necessary swap recovery material in SQLite before requesting authorization, and an in-process settlement worker resumes pending work after restart. This keeps the single-publisher MVP operationally small while requiring durable local storage and deferring distributed worker coordination; server-side payment recovery remains in scope even though browser auction retries do not.

Agreed on 2026-09-22. The default implementation requirements are in [PUBLISHER.md: Durable payment recovery](../../PUBLISHER.md#durable-payment-recovery); the protocol's immutable authorization requirements remain in [FLOW.md](../../FLOW.md#one-authorized-bid-per-impression).
