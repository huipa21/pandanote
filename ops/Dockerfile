# One Node instance; all native artifacts are installed inside Alpine/musl.
# Verified multi-platform index, preserving the AMD64 and ARM64 build options.
ARG NODE_IMAGE=docker.io/library/node:24.21.0-alpine3.23@sha256:9ec4a2e289874ed0d722e1772ec2de45d2801541db8612f3638b26f128c69ac2

FROM ${NODE_IMAGE} AS build
# Native addons can fall back to node-gyp when a prebuilt download is unavailable.
# Keep the compiler/Python/CA bundle in install stages only, never in runtime.
RUN apk add --no-cache ca-certificates python3 make g++
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
ARG PANDANOTE_VERSION
ARG PANDANOTE_COMMIT
ARG PANDANOTE_COMMITTED_AT
# ORIGIN is read at runtime; the build needs no domain, DATA_DIR or secret.
# Reject missing/partial provenance; use `npm run image:build` from clean Git.
RUN node scripts/verify-build-metadata.ts && npm run build

FROM ${NODE_IMAGE} AS production-deps
RUN apk add --no-cache ca-certificates python3 make g++
WORKDIR /app
# Dedicated locked runtime graph; explicit Svelte peer, optional musl Sharp kept.
COPY ops/runtime/package.json ops/runtime/package-lock.json .npmrc ./
RUN npm ci --omit=dev --omit=peer \
    && find node_modules -type f -name '*.map' -delete
# Prune BEFORE COPY: maps never enter a runtime layer. Do not remove executable,
# native, grammar/WASM, metadata or license assets, nor client gzip/Brotli files.

FROM ${NODE_IMAGE} AS runtime
RUN apk add --no-cache ca-certificates libstdc++
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
    PUID=1000 \
    PGID=1000
WORKDIR /app
# Production artifact + operator tooling only: no tests, fixtures, docs or dev dependencies.
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package.json ./
COPY migrations ./migrations
COPY scripts/reset-password.ts scripts/reindex.ts scripts/container-entry.ts scripts/container-bootstrap.ts scripts/container-user.ts ./scripts/
COPY src/lib ./src/lib
# Private persistent root. A named volume inherits this owner/mode on first use.
RUN mkdir /data && chown node:node /data && chmod 700 /data
# Root is used only to prepare the private bind directory. The entrypoint drops
# permanently to PUID/PGID BEFORE opening keys/SQLite or starting any command.
USER root
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
ENTRYPOINT ["node", "scripts/container-entry.ts"]
CMD ["node", "build/index.js"]
