FROM node:24-alpine AS builder

WORKDIR /app

# Instalar desde pnpm-lock.yaml: con `npm install` sin lockfile cada build
# resolvía versiones nuevas (p. ej. typeorm 1.1.x en vez del 1.0.0 probado).
RUN npm install -g pnpm@10.34.9

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

FROM node:24-alpine AS production

WORKDIR /app

USER node

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "dist/main"]

