# trust-controller — Hono control-plane service, run directly with tsx (no build step).
# Config comes entirely from the environment (k8s injects it); no .env in the image.
FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production
# PORT is read from the environment by src/config.ts (default 8091).
CMD ["npx", "tsx", "src/index.ts"]
