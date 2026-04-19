# syntax=docker/dockerfile:1.6
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/
# Copy the prisma schema BEFORE install so the @prisma/client postinstall
# can generate the typed client against our schema file.
COPY apps/backend/src/prisma apps/backend/src/prisma
RUN pnpm install --filter @finlink/backend... --frozen-lockfile=false
# Explicit generate as a belt-and-suspenders step.
RUN pnpm --filter @finlink/backend exec prisma generate

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/backend apps/backend
# Build the shared package first — backend imports from @finlink/shared
# which now resolves through node_modules to packages/shared/dist/index.js.
RUN pnpm --filter @finlink/shared build
# Re-generate after source copy to ensure the client is current.
RUN pnpm --filter @finlink/backend exec prisma generate
RUN pnpm --filter @finlink/backend build

FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
RUN apk add --no-cache openssl bash
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=build /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=build /app/apps/backend/dist ./apps/backend/dist
COPY --from=build /app/apps/backend/src/prisma ./apps/backend/src/prisma

COPY apps/backend/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3001
WORKDIR /app/apps/backend
CMD ["/docker-entrypoint.sh"]
