# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — dependency installation
# Use the full image here so native add-ons (if any) can compile.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS deps

WORKDIR /app

COPY package.json ./

# Install only production dependencies — no devDependencies in the image.
RUN npm install --omit=dev --no-audit --no-fund && \
    npm cache clean --force

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — runtime image
# node:20-slim is Debian-based (~80 MB compressed) and supports the Chromium
# .deb packages we need. Alpine is smaller but musl-libc breaks Chromium.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS runtime

# Metadata
LABEL maintainer="pdf-service" \
      description="Lightweight PDF generation microservice"

# ── System dependencies for Chromium ─────────────────────────────────────────
# This list is the minimal set required to run chromium on Debian slim.
# Each package is pinned to whatever apt resolves — acceptable for a build-time
# dependency. The --no-install-recommends flag keeps the layer lean.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        chromium \
        fonts-liberation \
        fonts-noto-color-emoji \
        libnss3 \
        libatk1.0-0 \
        libatk-bridge2.0-0 \
        libcups2 \
        libdrm2 \
        libxkbcommon0 \
        libxcomposite1 \
        libxdamage1 \
        libxfixes3 \
        libxrandr2 \
        libgbm1 \
        libasound2 \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ── Non-root user ─────────────────────────────────────────────────────────────
# Running as root is required when using --no-sandbox (which we do).
# We keep the node user available but run as root for Chromium compatibility.
# If your security policy requires a non-root user, remove --no-sandbox and
# set up a user namespace instead.

WORKDIR /app

# ── Copy artifacts from deps stage ───────────────────────────────────────────
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src/ ./src/

# ── Environment ───────────────────────────────────────────────────────────────
ENV NODE_ENV=production \
    PORT=3000 \
    # Tell browser.js where Chromium lives (installed by apt above).
    CHROMIUM_PATH=/usr/bin/chromium \
    # Puppeteer should not try to download its own Chromium bundle.
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    # Tune these for your container's memory budget.
    MAX_CONCURRENT_PAGES=5 \
    PAGE_LOAD_TIMEOUT_MS=30000 \
    PDF_RENDER_TIMEOUT_MS=20000 \
    BODY_SIZE_LIMIT=10mb

EXPOSE 3000

# Docker health check — probes the /health endpoint every 30 s.
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "src/server.js"]
