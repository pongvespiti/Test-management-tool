# syntax=docker/dockerfile:1
# TMT API image. Build context = repository root:
#   docker build -f apps/api/Dockerfile -t tmt-api .
# Targets: `api` (runtime, default) and `migrate` (one-shot `prisma migrate deploy`).
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable
WORKDIR /repo

# ---- build: install, generate the Prisma client, compile -------------------------------------
FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/excel/package.json packages/excel/
COPY packages/database/package.json packages/database/
COPY packages/jest-config/package.json packages/jest-config/
COPY packages/tsconfig/package.json packages/tsconfig/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile
COPY packages packages
COPY apps/api apps/api
# `prisma generate` only reads the schema; the URL is a placeholder that is never connected to.
ARG DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm exec turbo run build --filter=@tmt/api...

# ---- migrate: applies the SQL migrations, then exits ------------------------------------------
FROM build AS migrate
WORKDIR /repo/packages/database
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

# ---- deploy: production dependencies + compiled output only ------------------------------------
FROM build AS deploy
RUN pnpm --filter @tmt/api deploy --prod --legacy /out

# ---- api: runtime image ---------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS api
ENV NODE_ENV=production \
  API_HOST=0.0.0.0 \
  API_PORT=4000 \
  DATA_DIR=/data
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data && chown node:node /data
WORKDIR /app
COPY --from=deploy --chown=node:node /out ./
USER node
VOLUME ["/data"]
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.API_PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/main.js"]
