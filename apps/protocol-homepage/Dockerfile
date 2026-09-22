FROM oven/bun:1.3.14 AS build

WORKDIR /app
COPY package.json bun.lock ./
COPY apps/protocol-homepage/package.json ./apps/protocol-homepage/package.json
RUN bun install --frozen-lockfile

COPY FLOW.md NOSTR.md CONTEXT.md OPENRTB*.md PREBID*.md ADS-TXT-NOSTR.md /app/
COPY docs/adr/ /app/docs/adr/
COPY docs/agents/domain.md /app/docs/agents/domain.md
COPY apps/protocol-homepage/ ./apps/protocol-homepage/
RUN bun run build:homepage

FROM nginx:stable-alpine
COPY apps/protocol-homepage/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/apps/protocol-homepage/dist /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
