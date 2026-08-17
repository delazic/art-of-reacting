# syntax=docker/dockerfile:1

# ---------- Stage 1: build the static bundle ----------
# Node 22 rather than 20: Vite 8 declares engines.node ^20.19.0 || >=22.12.0,
# and Node 20 reached end-of-life in April 2026.
FROM node:22-alpine AS build

WORKDIR /app

# npm ci installs exactly what package-lock.json pins and fails if the lockfile
# and package.json have drifted — which is why the lockfile is committed. In a
# layer of its own, so editing a component does not reinstall node_modules.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json vite.config.ts index.html ./
COPY src/ src/

# `npm run build` is `tsc --noEmit && vite build`, so a type error fails the
# image build instead of shipping a bundle that never typechecked.
RUN npm run build

# ---------- Stage 2: serve it ----------
FROM nginx:alpine AS runtime

# Replaces the image's stock server block. This is what resolves /api/*.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/

EXPOSE 80

# wget is part of busybox in nginx:alpine, so this check adds no package.
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost/ || exit 1
