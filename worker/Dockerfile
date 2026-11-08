# Salla Planner scan worker (Beta 5): runs on the GPU VM only, never next to the app.
# Build on the GPU VM:  docker build -t salla-scan-worker:latest /opt/salla-worker/src
# Run (see run-once.sh): docker run --rm --gpus all --env-file .env salla-scan-worker:latest

# ---- build the TypeScript worker
FROM node:22-bookworm-slim AS build
WORKDIR /worker
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json && npm prune --omit=dev

# ---- Node.js binary for the runtime image
FROM node:22-bookworm-slim AS node

# ---- runtime: CUDA 12 (Meshroom 2025 binaries are built with CUDA 12), ffmpeg, assimp, Meshroom
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04
# Meshroom (MPL-2.0) release archive; about 11 GB unpacked. Check the newest stable release at
# https://github.com/alicevision/Meshroom/releases before building.
ARG MESHROOM_URL=https://zenodo.org/records/16887472/files/Meshroom-2025.1.0-Linux.tar.gz
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     ca-certificates curl ffmpeg assimp-utils libgomp1 libgl1 libglib2.0-0 libxkbcommon0 \
  && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /opt/meshroom \
  && curl -fL --retry 3 "$MESHROOM_URL" | tar -xz -C /opt/meshroom --strip-components=1 \
  && test -x /opt/meshroom/meshroom_batch
COPY --from=node /usr/local/bin/node /usr/local/bin/node
WORKDIR /worker
COPY package.json ./
COPY --from=build /worker/node_modules ./node_modules
COPY --from=build /worker/dist ./dist
ENV NODE_ENV=production \
    MESHROOM_BATCH=/opt/meshroom/meshroom_batch \
    WORK_DIR=/work
CMD ["node", "dist/main.js"]
