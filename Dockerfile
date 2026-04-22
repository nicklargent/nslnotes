# syntax=docker/dockerfile:1.7

# ---- Stage 1: frontend build ----
FROM node:22-bookworm-slim AS frontend
WORKDIR /app

# Install deps first for layer caching
COPY package.json package-lock.json ./
RUN npm ci

# Build
COPY . .
RUN npm run build


# ---- Stage 2: backend build ----
FROM rust:1.90-bookworm AS backend
WORKDIR /build

# System deps for building
RUN apt-get update && apt-get install -y --no-install-recommends \
        pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Copy workspace. `default-members` in the root Cargo.toml skips src-tauri so
# only nslnotes-core + nslnotes-web get compiled here.
COPY Cargo.toml Cargo.lock ./
COPY src-lib src-lib
COPY src-web src-web
COPY src-tauri src-tauri

# rust-embed reads ../dist/ at compile time via src-web/src/routes.rs
COPY --from=frontend /app/dist /build/dist

RUN cargo build --release --locked


# ---- Stage 3: runtime ----
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        tini \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -r -u 1000 -d /home/nslnotes -m nslnotes \
    && mkdir -p /data /config \
    && chown -R nslnotes:nslnotes /data /config

COPY --from=backend /build/target/release/nslnotes-web /usr/local/bin/nslnotes-web

USER nslnotes
WORKDIR /home/nslnotes

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/nslnotes-web"]
CMD ["--port", "3000", "--settings-path", "/config/settings.json", "--notes-dir", "/data"]
