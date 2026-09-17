# Real Open Bidding website

A responsive protocol website built with Vite, React, TypeScript, Tailwind CSS v4, and shadcn/ui (Radix / Nova).

## Develop

Requires Node.js 22.12+ (or a newer supported version) and npm.

```sh
cd website
npm ci
npm run dev
```

## Check and build

```sh
npm run lint
npm run build
npm run preview
```

The production output is `website/dist/`, suitable for static hosting. There is no backend, wallet connection, or live bidding integration.

## Content

V1 covers HTML banners only: bids include the complete markup with the oracle pixel inserted before signing. Broader media types discussed in the reference documents are outside the v1 scope.

- `src/protocol.ts` contains the seven-step settlement walkthrough, participant descriptions, and trust questions derived from `../FLOW.md`. The walkthrough covers commitments signed with a fresh refund key, the separate Nostr identity, and the alternative refund path for unspent bids after the bidder-chosen deadline. `../NOSTR.md` defines the transport and proposed bid payload; `../FLOW.md` owns the commitment signing construction and verification rules.
- The specification reader imports `../FLOW.md` directly and is loaded on demand. The original Markdown and `../OPENRTB.md` are included as downloadable build assets.
- `src/index.css` contains semantic theme tokens, responsive styles, and reduced-motion alternatives.
- `src/components/ui/` contains CLI-generated shadcn components.

Keep this project inside the repository: the specification imports intentionally refer to the source documents in the parent directory. Updates to the narrative summaries should be checked against `FLOW.md`.

## Fly.io deployment

The app is `real-open-bidding` in the `personal` organization, hosted at
https://real-open-bidding.fly.dev. It uses one shared vCPU and 256 MB RAM in
Amsterdam (`ams`). The Machine stops when idle and starts on incoming requests.

From the **repository root**, deploy with:

```sh
flyctl deploy . --config website/fly.toml --ignorefile "$PWD/.dockerignore" --remote-only --ha=false
```

The root build context includes `FLOW.md` and `OPENRTB.md`. The explicit ignore
file keeps local dependencies, build output, and unrelated files out of the
remote build. The multi-stage Dockerfile compiles the Vite site, then serves only
the generated static files with nginx. HTTPS is enforced, `/healthz` provides the
health check, and hashed assets are cached while HTML is revalidated.

`--ha=false` keeps the first deployment to a single Machine. If the app is ever
scaled manually, inspect `flyctl machine list --app real-open-bidding` before
changing its count.
