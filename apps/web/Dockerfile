# Build the Vite application with the same Node/pnpm baseline as the backend.
FROM public.ecr.aws/docker/library/node:24-alpine AS build

RUN npm install --global pnpm@10.15.0 \
  && pnpm --version

WORKDIR /app

# Keep dependency installation cacheable and install only the web workspace
# plus the shared contracts it imports.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --filter @module-atelier/web... --frozen-lockfile

COPY apps/web apps/web
COPY packages/contracts packages/contracts

ARG VITE_API_MODE=http
ARG VITE_API_BASE=
ENV VITE_API_MODE=${VITE_API_MODE}
ENV VITE_API_BASE=${VITE_API_BASE}

RUN pnpm --filter @module-atelier/web build

# Caddy serves the immutable Vite output and keeps the browser same-origin with
# the API by proxying /api/* to the backend Compose network.
FROM public.ecr.aws/docker/library/caddy:2-alpine

COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv

RUN addgroup -S -g 10001 caddy \
  && adduser -S -D -H -u 10001 -G caddy caddy \
  && chown -R caddy:caddy /etc/caddy /srv

ENV API_UPSTREAM=api:3000

USER caddy

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
