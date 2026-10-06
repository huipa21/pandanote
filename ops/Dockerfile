# PandaNote production image (S18). One Node instance; Linux/glibc native
# modules (better-sqlite3, argon2, sharp) are installed here, never copied from a
# developer machine. The pinned base is the same Node 24.21.0 bookworm digest used
# by the validation images.
ARG NODE_IMAGE=docker.io/library/node:24.21.0-bookworm-slim@sha256:5cbc7caba8c2c0f0bca675d1b61b9f2857e1cf1853c6164ee9dd409501a936e7

FROM ${NODE_IMAGE} AS build
ARG PANDANOTE_VERSION
ARG PANDANOTE_COMMIT
ARG PANDANOTE_COMMITTED_AT
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
# ORIGIN is read at runtime; the build needs no domain, DATA_DIR or secret.
# Reject missing/partial provenance; use `npm run image:build` from clean Git.
RUN node scripts/verify-build-metadata.ts && npm run build

FROM ${NODE_IMAGE} AS production-deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
# `prepare` runs svelte-kit sync (a dev dependency) and is not needed in production.
RUN npm pkg delete scripts.prepare \
    && npm ci --omit=dev

FROM ${NODE_IMAGE} AS runtime
ARG PANDANOTE_VERSION
ARG PANDANOTE_COMMIT
ARG PANDANOTE_COMMITTED_AT
# `created` records the UTC source commit time, not the build clock.
LABEL org.opencontainers.image.title="PandaNote" \
    org.opencontainers.image.version="${PANDANOTE_VERSION}" \
    org.opencontainers.image.revision="${PANDANOTE_COMMIT}" \
    org.opencontainers.image.created="${PANDANOTE_COMMITTED_AT}"
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data \
    BODY_SIZE_LIMIT=64G \
    NODE_OPTIONS=--max-old-space-size=1536
WORKDIR /app
# Production artifact + operator tooling only: no tests, fixtures, docs or dev dependencies.
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package.json ./
COPY migrations ./migrations
COPY scripts/migrate.ts scripts/setup-token.ts scripts/auth-recover.ts scripts/reindex.ts ./scripts/
COPY src/lib ./src/lib
# Private persistent root. A named volume inherits this owner/mode on first use.
RUN mkdir /data && chown node:node /data && chmod 700 /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "build/index.js"]
