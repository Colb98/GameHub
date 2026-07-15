# Build context: repository root
FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /app
# NEXT_PUBLIC_* values are baked into the client bundle at build time
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_GAMES_BASE_URL
ARG API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_GAMES_BASE_URL=$NEXT_PUBLIC_GAMES_BASE_URL \
    API_URL=$API_URL \
    NEXT_STANDALONE=1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile --filter "@gamehub/web..."
RUN pnpm --filter @gamehub/sdk build && pnpm --filter @gamehub/web build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
