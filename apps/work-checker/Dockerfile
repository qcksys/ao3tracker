# syntax=docker/dockerfile:1
# Build from the repository root, which holds the lockfile and the shared core package:
#   docker build --platform linux/amd64 -f apps/work-checker/Dockerfile -t ao3tracker-work-checker .
# Google Chrome has no Linux arm64 build, so the image is linux/amd64 only.
FROM node:26.12.1-bookworm-slim

WORKDIR /app
RUN npm install --global pnpm@12.8.2

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ao3-core/package.json packages/ao3-core/
COPY apps/work-checker/package.json apps/work-checker/
RUN pnpm install --frozen-lockfile --prod --ignore-scripts \
  --filter @qcksys/ao3tracker-work-checker...

# Google Chrome stable with its system libraries, and a virtual display for its window.
RUN apt-get update \
  && apt-get install --yes --no-install-recommends xvfb xauth \
  && apps/work-checker/node_modules/.bin/patchright install --with-deps chrome \
  && rm -rf /var/lib/apt/lists/*

COPY packages/ao3-core/src packages/ao3-core/src
COPY apps/work-checker/src apps/work-checker/src

# The base image's `node` user is UID 1000, so host-owned secret files can be mounted read-only.
RUN mkdir -p /data/profile && chown -R node:node /data
USER node
WORKDIR /app/apps/work-checker
# Reported as the checker's version on the admin dashboard; CI passes the source commit.
ARG SOURCE_REF=unknown
ENV CHECKER_VERSION=$SOURCE_REF
ENV PROFILE_DIR=/data/profile
VOLUME /data
LABEL org.opencontainers.image.source="https://github.com/qcksys/ao3tracker"

# Healthy once a poll has reached the Worker; the first poll runs at startup.
HEALTHCHECK --interval=30s --timeout=5s --start-period=3m --retries=3 CMD ["node", "src/health.ts"]
CMD ["xvfb-run", "--auto-servernum", "--server-args=-screen 0 1366x900x24", "node", "src/main.ts"]
