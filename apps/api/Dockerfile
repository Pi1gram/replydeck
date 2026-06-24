ARG NODE_VERSION=20

FROM node:${NODE_VERSION}-alpine AS base
RUN apk add --no-cache openssl libc6-compat tini

# ── builder ────────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

# 1. Copy manifests first for layer-cache efficiency
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

# 2. Install ALL dependencies (dev+prod) for the whole workspace
RUN npm ci --ignore-scripts

# 3. Copy source
COPY apps/api ./apps/api
COPY packages/shared ./packages/shared

# 4. Build @replydeck/shared → CJS dist so runtime node can require() it.
#    Override module/moduleResolution because shared's own tsconfig targets ESNext/Bundler,
#    but the API runtime is plain Node (CJS). We don't modify the source tsconfig.json.
#    Keep declaration:true so nest build (tsc strict) can find type info.
RUN npx tsc \
      --project packages/shared/tsconfig.json \
      --module commonjs \
      --moduleResolution node \
      --outDir packages/shared/dist \
      --declaration true \
      --declarationDir packages/shared/dist

# 5. Patch shared's package.json so node resolves main → dist/index.js
#    and tsc resolves types → dist/index.d.ts
RUN node -e " \
  const fs = require('fs'); \
  const p = 'packages/shared/package.json'; \
  const pkg = JSON.parse(fs.readFileSync(p, 'utf8')); \
  pkg.main = 'dist/index.js'; \
  pkg.types = 'dist/index.d.ts'; \
  fs.writeFileSync(p, JSON.stringify(pkg, null, 2)); \
"

# 6. Generate Prisma client (must run from api dir so schema is found)
WORKDIR /app/apps/api
RUN npx prisma generate

# 7. Build NestJS API
RUN npm run build

# 8. Prune dev dependencies from root node_modules
WORKDIR /app
RUN npm prune --omit=dev

# ── runtime ────────────────────────────────────────────────────────────────────
FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

# Root workspace manifest (needed by npm workspaces resolution)
COPY --from=builder /app/package.json ./

# Root node_modules (hoisted deps: @nestjs/*, @prisma/client, .prisma/client, etc.)
COPY --from=builder /app/node_modules ./node_modules

# API package manifest + compiled output + prisma schema
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma

# NOTE: In an npm workspace, deps are hoisted to root node_modules.
# apps/api/node_modules only exists if there are version conflicts that prevented hoisting.
# We skip copying it; the root node_modules (copied above) satisfies all requires.

# @replydeck/shared — patched package.json + CJS dist (no TS source needed)
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

WORKDIR /app/apps/api
EXPOSE 4000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main"]
