# syntax=docker/dockerfile:1

# One image: the Svelte SPA (apps/web/dist) and the Node/Socket.IO game server on port 8080.
ARG NODE_IMAGE=node:24.22.1-alpine3.24

# ---- build: install everything, bundle the server (esbuild) and build the SPA (vite) ----
FROM ${NODE_IMAGE} AS build
WORKDIR /app

# Manifests first so `npm ci` stays cached until a dependency changes.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

COPY . .
# The web `prebuild` downloads the MediaPipe model (SHA-256 verified) and copies the WASM files.
RUN npm run build

# ---- deps: production dependencies of @rps/server only, versions pinned by the lockfile ----
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
# @rps/shared is inlined into the bundle; its workspace symlink is dropped afterwards.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --workspace @rps/server --include-workspace-root=false --no-audit --no-fund \
    && rm -rf node_modules/@rps

# ---- runtime ----
FROM ${NODE_IMAGE} AS runtime
ARG VERSION=dev
ARG REVISION=unknown
LABEL org.opencontainers.image.title="rps-arena" \
      org.opencontainers.image.description="Comic rock-paper-scissors: web client and websocket game server" \
      org.opencontainers.image.source="https://github.com/Jaydee94/rps-arena" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}"

ENV NODE_ENV=production \
    PORT=8080
WORKDIR /app

# Layout matters: the default STATIC_DIR resolves to <server dist>/../../web/dist = /app/apps/web/dist.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
# Needed so Node treats the .js bundle as an ES module.
COPY apps/server/package.json ./apps/server/package.json

# Everything is root-owned and world-readable; the app writes nothing, so a read-only root
# filesystem and any non-root UID work. 1000 is the official image's `node` user.
USER 1000:1000
EXPOSE 8080
STOPSIGNAL SIGTERM
# Exec form, no shell: node is PID 1 and handles SIGTERM itself (graceful shutdown).
ENTRYPOINT ["node", "apps/server/dist/main.js"]
