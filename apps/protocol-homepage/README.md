# ROB protocol homepage

The public ROB homepage and specification reader, built with Vite, React, TypeScript, Tailwind CSS v4, and shadcn/ui (Radix / Nova). Its workspace package is `@rob/protocol-homepage`. The publisher implementation and its future demo belong in separate packages.

## Develop

Requires Bun 1.3.14. Run these commands from the repository root:

```sh
bun install --frozen-lockfile
bun run dev
```

## Check and build

```sh
bun run --filter @rob/protocol-homepage lint
bun run --filter @rob/protocol-homepage typecheck
bun run build:homepage
bun run preview
```

The production output is `apps/protocol-homepage/dist/`, suitable for static hosting. There is no backend, wallet connection, or live bidding integration. Dependencies are installed through the root workspace and its single `bun.lock`; the package scripts run the tooling with Bun.

## Content

V1 covers HTML banners on websites only: bids include the complete markup with the oracle pixel inserted before signing. In-app inventory and broader media types discussed in the reference documents are outside the v1 scope.

- `src/protocol.ts` contains the seven-step settlement walkthrough, participant descriptions, and trust questions derived from [FLOW.md](../../FLOW.md). It covers required oracle verification, optional seller authorization, signed banner dimensions, independent immutable bids, early selection without status messages, one authorized bid per opportunity, and refund recovery. [NOSTR.md](../../NOSTR.md) defines the transport and proposed payloads; FLOW.md owns payment and commitment verification rules.
- The specification reader imports FLOW.md directly and is loaded on demand. Links to its own sections navigate within the reader; links to other local documents download the corresponding Markdown. The build includes the specs, glossary, research notes, ADRs, and domain documentation rules so references remain available with the static site.
- `src/index.css` contains semantic theme tokens, responsive styles, and reduced-motion alternatives.
- `src/components/ui/` contains CLI-generated shadcn components.

Keep this project inside the repository: the specification imports intentionally refer to the source documents at the repository root. Check narrative summaries against [FLOW.md](../../FLOW.md), [NOSTR.md](../../NOSTR.md), the [glossary](../../CONTEXT.md), and [accepted ADRs](../../docs/adr/README.md). Exact rendering capabilities, numeric payload budgets, final wire encodings, and payment implementation details remain open; the homepage must not present those as settled.

## Fly.io deployment

The app is `real-open-bidding` in the `personal` organization, hosted at
https://real-open-bidding.fly.dev. It uses one shared vCPU and 256 MB RAM in
Amsterdam (`ams`). The Machine stops when idle and starts on incoming requests.

From the **repository root**, deploy with:

```sh
flyctl deploy . --config apps/protocol-homepage/fly.toml --dockerfile apps/protocol-homepage/Dockerfile --ignorefile "$PWD/.dockerignore" --remote-only --ha=false
```

The root build context includes the workspace manifest and lockfile, homepage,
root specs, glossary, research notes, ADRs, and domain documentation rules. The
explicit ignore file keeps local dependencies, build output, and unrelated files
out of the remote build. The multi-stage Dockerfile uses the pinned Bun version
and a frozen workspace install to compile the homepage, then serves only
the generated static files with nginx. HTTPS is enforced, `/healthz` provides the
health check, and hashed assets are cached while HTML is revalidated.

`--ha=false` keeps the first deployment to a single Machine. If the app is ever
scaled manually, inspect `flyctl machine list --app real-open-bidding` before
changing its count.
