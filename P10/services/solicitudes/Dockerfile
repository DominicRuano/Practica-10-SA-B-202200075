FROM node:22-alpine AS build
WORKDIR /app
COPY services/solicitudes/package*.json ./
RUN npm ci
COPY services/solicitudes/ ./
COPY telemetry/http.ts ./src/telemetry.ts
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production OTEL_SERVICE_NAME=solicitudes
WORKDIR /app
COPY services/solicitudes/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force && rm -rf /usr/local/lib/node_modules/npm
COPY --from=build /app/dist ./dist
COPY services/solicitudes/migrations ./migrations
COPY telemetry/node.cjs ./node.cjs
USER node
EXPOSE 3001
CMD ["node", "--require", "./node.cjs", "dist/server.js"]
