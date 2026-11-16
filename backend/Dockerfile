# syntax=docker/dockerfile:1

# ---- deps: install all dependencies (dev included) for the TypeScript build ----
FROM node:20.14.0-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- build: compile TypeScript to dist/ ----
FROM node:20.14.0-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---- prod-deps: production-only node_modules ----
FROM node:20.14.0-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# ---- runtime: minimal image with compiled code, migrations and prod deps ----
FROM node:20.14.0-alpine AS runtime
ENV NODE_ENV=production \
    PORT=4000
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY migrations ./migrations

# Run unprivileged; the node image ships a "node" user.
USER node

EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
