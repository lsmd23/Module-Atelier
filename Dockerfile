# M0 backend runtime image. The API runs TypeScript directly on Node 24; no
# compilation step is needed until the backend introduces a build artifact.
FROM public.ecr.aws/docker/library/node:24-alpine

RUN npm install --global pnpm@10.15.0 \
  && pnpm --version

WORKDIR /app

# Copy only manifests first so dependency installation remains cacheable.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/domain/package.json packages/domain/package.json

# Install only the API and its workspace dependencies. This deliberately uses
# the committed lockfile and excludes devDependencies from the runtime image.
RUN pnpm install --filter @module-atelier/api... --prod --frozen-lockfile

COPY apps/api apps/api
COPY packages/contracts packages/contracts
COPY packages/db packages/db
COPY packages/domain packages/domain

RUN chown -R node:node /app

USER node

ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=3000

EXPOSE 3000

# Health is dependency-aware: /api/health returns 503 when PostgreSQL is down.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"

CMD ["pnpm", "--filter", "@module-atelier/api", "start"]
