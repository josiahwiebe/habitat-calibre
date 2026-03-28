FROM oven/bun:1.3.9 AS bun

FROM node:lts-bookworm-slim AS base

WORKDIR /app

COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun

FROM base AS deps

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS build

COPY . .
RUN bun run build

FROM base AS prod-deps

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM base AS runner

ENV NODE_ENV=production
ENV PORT=3000
ENV CALIBRE_LIBRARY_PATH=/library
ENV CALIBRE_CACHE_TTL_SECONDS=45

COPY package.json bun.lock ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/.output ./.output

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
