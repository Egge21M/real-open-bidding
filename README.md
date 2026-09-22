# Real Open Bidding

ROB is an open, prepaid real-time bidding protocol built on Nostr and Cashu. This repository contains its specifications and a Bun workspace for its applications and shared libraries.

## Workspace

- [`apps/protocol-homepage/`](apps/protocol-homepage/README.md): the public ROB homepage and specification reader, named `@rob/protocol-homepage` within the workspace. It explains the protocol; it has no publisher auction, wallet, or live bidding integration.
- [`apps/protocol-demo/`](apps/protocol-demo/README.md): the interactive protocol lab, named `@rob/protocol-demo`. Replay requests, independently funded bids, oracle authorization, settlement and refunds; change participant choices and failure conditions. All network and cryptographic verification operations are simulated.
- `apps/*`: independently runnable applications. The oracle, bidder, and publisher implementations will be added as they are built.
- `packages/*`: shared libraries, including the future ROB protocol implementation. No shared library is scaffolded yet.

## Develop

Use Bun 1.3.14, pinned in `.bun-version` and `package.json`. Install dependencies from the repository root:

```sh
bun install --frozen-lockfile
bun run dev
```

`dev` starts the protocol homepage. `bun run preview` serves its production build locally.

Run the protocol lab with `bun run dev:demo` (default port 5174). Use `bun run build:demo`, `bun run preview:demo`, and `bun run test:demo` to build, preview, and test it. See its [README](apps/protocol-demo/README.md) for controls, modeled requirements, and simulation boundaries.

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
