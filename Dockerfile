# ---- build: install everything, build shared + server + web
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---- runtime: production dependencies + built output only
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/data
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/web/dist web/dist
VOLUME ["/app/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server/dist/index.js"]
