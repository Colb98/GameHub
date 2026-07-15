# Build context: repository root
FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile --filter "@gamehub/api..."
RUN pnpm --filter @gamehub/api exec prisma generate
RUN pnpm --filter @gamehub/api build

FROM node:20-alpine AS runtime
RUN corepack enable
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./
# Runs pending migrations, then starts the API
CMD ["sh", "-c", "pnpm --filter @gamehub/api exec prisma migrate deploy && node apps/api/dist/main.js"]
