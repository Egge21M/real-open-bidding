FROM node:24-alpine AS build

WORKDIR /app/website
COPY website/package.json website/package-lock.json ./
RUN npm ci

COPY FLOW.md NOSTR.md CONTEXT.md OPENRTB*.md PREBID*.md ADS-TXT-NOSTR.md /app/
COPY docs/adr/ /app/docs/adr/
COPY docs/agents/domain.md /app/docs/agents/domain.md
COPY website/ ./
RUN npm run build

FROM nginx:stable-alpine
COPY website/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/website/dist /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
