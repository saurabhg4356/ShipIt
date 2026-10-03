# ==========================================
# Stage 1: Build / Production Dependencies
# ==========================================
FROM node:22-alpine AS dependencies

WORKDIR /usr/src/app

COPY package.json package-lock.json ./

# Install only production dependencies
RUN npm ci --omit=dev && npm cache clean --force

# ==========================================
# Stage 2: Minimal Production Image
# ==========================================
FROM node:22-alpine AS production

# Install curl for container HEALTHCHECK
RUN apk add --no-cache curl

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /usr/src/app

# Copy production node_modules from dependencies stage
COPY --from=dependencies /usr/src/app/node_modules ./node_modules
COPY package.json ./
COPY src/ ./src/

# Change ownership to unprivileged user
RUN chown -R node:node /usr/src/app

# Drop root privileges
USER node

EXPOSE 3000

# Docker native healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "src/server.js"]
