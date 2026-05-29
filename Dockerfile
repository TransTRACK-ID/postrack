# Build stage - install dependencies and build
FROM node:23-alpine AS builder

WORKDIR /app

# Install build tools for better-sqlite3 native bindings
RUN apk add --no-cache bash curl python3 make g++

RUN curl -fsSL https://bun.sh/install | bash && \
    cp /root/.bun/bin/bun /usr/local/bin/bun && \
    rm -rf /root/.bun/install

COPY package.json bun.lockb ./
RUN bun install

COPY . .
# Generate migrations folder and ensure it exists
RUN npx drizzle-kit generate && mkdir -p drizzle
RUN bun run build

# Production stage - minimal runtime
FROM node:23-alpine

WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache bash

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

COPY --from=builder /app/.output /app/.output
COPY --from=builder /app/node_modules /app/node_modules
# Copy drizzle folder to both locations for compatibility
COPY --from=builder /app/drizzle /app/drizzle/
COPY --from=builder /app/drizzle /app/.output/server/drizzle/
COPY --from=builder /usr/local/bin/bun /usr/local/bin/bun

# Create necessary directories for SQLite and File Storage with proper permissions
RUN mkdir -p /app/data /app/collections && \
    chown -R nodejs:nodejs /app/data /app/collections /app/.output /app/drizzle

USER nodejs

EXPOSE 3000

ENV NUXT_HOST=0.0.0.0
ENV NUXT_PORT=3000
ENV DATABASE_PATH=/app/data/sqlite.db

CMD ["node", "--require", "dd-trace/init", ".output/server/index.mjs"]
