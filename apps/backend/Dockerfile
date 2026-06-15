# Multi-stage build. Build context is the repo root (see docker-compose.yml).
FROM node:22-alpine AS build
WORKDIR /app
COPY apps/backend/package.json apps/backend/package-lock.json* ./
RUN npm install
COPY apps/backend/tsconfig*.json apps/backend/nest-cli.json ./
COPY apps/backend/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
EXPOSE 3000
CMD ["node", "dist/main.js"]
