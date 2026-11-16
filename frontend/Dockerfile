# syntax=docker/dockerfile:1

# ---- deps: install locked dependencies ----
FROM node:20.14.0-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- build: produce a standalone Next.js server ----
FROM node:20.14.0-alpine AS build
WORKDIR /app
# NEXT_PUBLIC_* values are inlined at build time, so the API URL must be known here.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runtime: only the standalone output and static assets ----
FROM node:20.14.0-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

# Next writes runtime caches under .next; the unprivileged user needs to own it.
RUN chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=25s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
