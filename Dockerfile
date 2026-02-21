# Stage 1: Install ALL dependencies (including dev) for type checking
FROM oven/bun:1.3 AS build

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy all source (filtered by .dockerignore)
COPY . .

# Verify TypeScript compiles
RUN bun run typecheck

# Stage 2: Install production dependencies only
FROM oven/bun:1.3 AS deps

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Stage 3: Production image
FROM oven/bun:1.3-slim AS production

WORKDIR /app

ENV NODE_ENV=production
ENV TZ=UTC

# Production dependencies
COPY --from=deps /app/node_modules ./node_modules

# Application files
COPY --from=build /app/package.json ./
COPY --from=build /app/tsconfig.json ./
COPY --from=build /app/src/ ./src/

# TODO: Uncomment when these directories have content beyond .gitkeep
# COPY --from=build /app/prompts/ ./prompts/
# COPY --from=build /app/drizzle/ ./drizzle/

EXPOSE 3000

CMD ["bun", "run", "src/app.ts"]
