# console — Next.js 15 governance UI.
# NEXT_PUBLIC_* values are baked into the client bundle at build time, so the target
# hostnames must be passed as build args (see deploy/scripts/03-build-push-demo.sh).
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG NEXT_PUBLIC_TC_URL
ARG NEXT_PUBLIC_BRIDGE_URL
ENV NEXT_PUBLIC_TC_URL=$NEXT_PUBLIC_TC_URL
ENV NEXT_PUBLIC_BRIDGE_URL=$NEXT_PUBLIC_BRIDGE_URL
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/next.config.mjs ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next

EXPOSE 8090
# next start -p 8090
CMD ["npm", "run", "start"]
