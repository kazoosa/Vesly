# syntax=docker/dockerfile:1.6
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app
COPY pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/dashboard/package.json apps/dashboard/
RUN pnpm install --filter @finlink/dashboard... --frozen-lockfile=false

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/dashboard apps/dashboard
RUN pnpm --filter @finlink/shared build
ARG VITE_API_URL=http://localhost:3001
ARG VITE_LINK_UI_URL=http://localhost:5175
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_LINK_UI_URL=$VITE_LINK_UI_URL
RUN pnpm --filter @finlink/dashboard build

FROM nginx:1.27-alpine
COPY apps/dashboard/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/dashboard/dist /usr/share/nginx/html
EXPOSE 80
