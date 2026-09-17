FROM node:24-alpine AS build

WORKDIR /app/website
COPY website/package.json website/package-lock.json ./
RUN npm ci

COPY FLOW.md OPENRTB.md /app/
COPY website/ ./
RUN npm run build

FROM nginx:stable-alpine
COPY website/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/website/dist /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
