# Real Open Bidding

ROB is an open, prepaid real-time bidding protocol built on Nostr and Cashu. This repository contains its specifications and a Bun workspace for its applications and shared libraries.

## Workspace

- [`apps/protocol-homepage/`](apps/protocol-homepage/README.md): the public ROB homepage and specification reader, named `@rob/protocol-homepage` within the workspace. It explains the protocol; it has no publisher auction, wallet, or live bidding integration.
- [`apps/oracle/`](apps/oracle/): the initial oracle service, named `@rob/oracle`, with NIP-98 authorization, Cashu signing, and SQLite persistence. Oracle conformance tests are still to be added.
- [`apps/publisher/`](apps/publisher/README.md): standalone Bun publisher server with Nostr auctions, local funding validation, SQLite/Drizzle recovery, and mint settlement.
- [`packages/publisher-sdk/`](packages/publisher-sdk/README.md): independent browser SDK for placement configuration, explicit ad loads, and isolated rendering.
- `apps/*`: independently runnable applications. A bidder implementation will be added separately.
- `packages/*`: independently buildable libraries. A shared ROB protocol library remains future work.

## Oracle MVP

The first implementation milestone is an oracle that verifies a creative/payment commitment, observes the matching pixel callback, and issues payment authorization after the required checks pass. The existing [oracle verification rules](FLOW.md#6-publisher-requests-oracle-authorization), including authorization of at most one bid per impression, apply to this milestone.

The MVP uses a [NIP-98-authenticated HTTPS authorization endpoint](NOSTR.md#oracle-http-authentication) and signs publisher-supplied Cashu swaps. It performs [local authorization checks](FLOW.md#oracle-mvp-validation-boundary) without mint calls; the publisher owns funding acceptance, keyset-unit validation, and settlement.

Recorded pixel callbacks persist across restarts without automatic expiry in the MVP. Issued authorization bindings remain permanent, and exact retries return the stored signature. Callback cleanup is deferred.

The oracle's deliverable ends at payment authorization. Publisher development can proceed in parallel against the documented oracle contract; funding, settlement, and refund interactions with the mint belong to the bidder and publisher. Full end-to-end integration testing will follow once those pieces are available and is not a completion requirement for the standalone oracle milestone.

## Publisher MVP

The default publisher implementation is a standalone Bun server for one publisher, supporting multiple websites. A small browser SDK declares inventory and sizes, requests auctions, and renders selected creatives in isolated iframes with JavaScript support. Publisher signing keys and wallet state stay on the server; the browser receives the selected creative before payment completes so its embedded pixel can reach the oracle.

Page code explicitly loads ads into SDK-defined placements, making one auction request with no browser retries. The server checks allowed website origins, defaults public context to the site domain, and selects the highest positive expected net bid when collection closes at `closes_at`. It fixes the selection before returning a URL for the unchanged creative document. SQLite and an in-process worker preserve pending payment work across restarts.

Each auction has a fresh publisher payment keypair. Funding acceptance verifies DLEQ against saved authenticated mint keys and the required 2-of-2 locks, without querying mint spend state. Existing bidder refund deadlines remain separate from `closes_at`.

An isolated proof is sufficient for the publisher MVP: real publisher logic runs against controlled relay, oracle, and mint counterparts, with a browser exercise covering the SDK. It covers selection, no-fill, unchanged rendering, missing-pixel retries, settlement, and restart recovery. A full end-to-end integration test will be built once all components are available. An embeddable publisher library is outside the current milestone.

The [publisher design](PUBLISHER.md) records the agreed architecture, behavior, isolated proof, and deliberately deferred implementation details. The rationale is recorded in [ADRs 0010–0014](docs/adr/README.md).

The [server setup and local interface profile](apps/publisher/README.md) and [SDK usage](packages/publisher-sdk/README.md) document the implementation. Run `bun run test:publisher` for isolated logic/relay tests and `bun run test:publisher:browser` for the Chromium proof. Shared-wire conformance and full system integration remain separate work.

## Develop

Use Bun 1.3.14, pinned in `.bun-version` and `package.json`. Install dependencies from the repository root:

```sh
bun install --frozen-lockfile
bun run dev
```

`dev` starts the protocol homepage. `bun run preview` serves its production build locally.

Run the workspace checks and build from the root:

```sh
bun run lint
bun run typecheck
bun run build
```

`bun run build:homepage` builds only the homepage. To run another package-specific command, use Bun's workspace filter, for example:

```sh
bun run --filter @rob/protocol-homepage lint
```

All workspaces share the root `bun.lock`. Declare dependencies in the package that uses them and install from the root; use `workspace:*` for dependencies on local packages. Each application or library owns its scripts and TypeScript settings. See [Bun workspaces](https://bun.sh/docs/pm/workspaces) for the workspace commands.

The homepage's build output and Fly.io deployment instructions are documented in its [README](apps/protocol-homepage/README.md).

## Protocol documentation

- [CONTEXT.md](CONTEXT.md): shared domain glossary for every package.
- [FLOW.md](FLOW.md): agreed protocol flow, payment rules, and remaining decisions.
- [NOSTR.md](NOSTR.md): transport and proposed message payloads.
- [PUBLISHER.md](PUBLISHER.md): agreed default publisher implementation design and deliberately deferred details.
- [Architectural decisions](docs/adr/README.md): accepted decisions and rationale.
- [Optional seller authorization](ADS-TXT-NOSTR.md): the draft ads.txt extension.

The oracle, bidder, and publisher share this domain vocabulary. Their implementation boundaries do not create separate glossaries. [AGENTS.md](AGENTS.md) and the [domain documentation rules](docs/agents/domain.md) apply across the repository.
