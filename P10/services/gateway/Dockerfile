FROM node:22-alpine AS build
WORKDIR /app
COPY services/gateway/package*.json ./
RUN npm ci
COPY services/gateway/app.js services/gateway/server.js services/gateway/tsconfig.json ./
COPY telemetry/http.ts ./http.ts
RUN npx tsc

FROM node:22-alpine AS runtime
ENV NODE_ENV=production OTEL_SERVICE_NAME=gateway
WORKDIR /app
COPY services/gateway/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force && rm -rf /usr/local/lib/node_modules/npm
COPY --from=build /app/dist ./dist
COPY telemetry/node.cjs ./node.cjs
USER node
EXPOSE 8080
CMD ["node", "--require", "./node.cjs", "dist/server.js"]
