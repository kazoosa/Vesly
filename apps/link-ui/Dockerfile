# syntax=docker/dockerfile:1.6
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app
COPY pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/link-ui/package.json apps/link-ui/
RUN pnpm install --filter @finlink/link-ui... --frozen-lockfile=false

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/link-ui apps/link-ui
RUN pnpm --filter @finlink/shared build
ARG VITE_API_URL=http://localhost:3001
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm --filter @finlink/link-ui build

FROM nginx:1.27-alpine
COPY apps/link-ui/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/link-ui/dist /usr/share/nginx/html
EXPOSE 80
