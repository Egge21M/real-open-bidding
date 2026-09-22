# Real Open Bidding

ROB is an open, prepaid real-time bidding protocol built on Nostr and Cashu. This repository contains its specifications and a Bun workspace for its applications and shared libraries.

## Workspace

- [`apps/protocol-homepage/`](apps/protocol-homepage/README.md): the public ROB homepage and specification reader, named `@rob/protocol-homepage` within the workspace. It explains the protocol; it has no publisher auction, wallet, or live bidding integration.
- [`apps/oracle/`](apps/oracle/README.md): the standalone Bun oracle, with Zod validation and Drizzle over `bun:sqlite`. Bidder and publisher adapters will follow.
- `packages/*`: shared libraries, including the future ROB protocol implementation. No shared library is scaffolded yet.

## Oracle MVP

The first implementation milestone is an oracle that verifies a creative/payment commitment, observes the matching pixel callback, and issues payment authorization after the required checks pass. The existing [oracle verification rules](FLOW.md#6-publisher-requests-oracle-authorization), including authorization of at most one bid per impression, apply to this milestone.

The MVP uses a [NIP-98-authenticated HTTPS authorization endpoint](NOSTR.md#oracle-http-authentication) and signs publisher-supplied Cashu swaps. It performs [local authorization checks](FLOW.md#oracle-mvp-validation-boundary) without mint calls; the publisher owns funding authenticity, keyset-unit validation, and spendability checks.

Recorded pixel callbacks persist across restarts without automatic expiry in the MVP. Issued authorization bindings remain permanent, and exact retries return the stored signature. Callback cleanup is deferred.

The oracle's deliverable ends at payment authorization. The bidder and publisher adapters will be built afterwards; funding, settlement, and refund interactions with the mint belong to those participants. Full end-to-end integration testing will follow once those pieces are available and is not a completion requirement for the standalone oracle milestone.

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
- [Architectural decisions](docs/adr/README.md): accepted decisions and rationale.
- [Optional seller authorization](ADS-TXT-NOSTR.md): the draft ads.txt extension.

The oracle, bidder, and publisher share this domain vocabulary. Their implementation boundaries do not create separate glossaries. [AGENTS.md](AGENTS.md) and the [domain documentation rules](docs/agents/domain.md) apply across the repository.
