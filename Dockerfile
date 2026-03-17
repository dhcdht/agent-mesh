FROM node:20-alpine AS base

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm@9 && pnpm install --frozen-lockfile

COPY packages/shared/package.json packages/shared/
COPY packages/node/package.json packages/node/
RUN pnpm build --filter @agent-mesh/shared --filter @agent-mesh/node

FROM base AS coordinator

COPY packages/coordinator/package.json packages/coordinator/
RUN pnpm build --filter @agent-mesh/coordinator

COPY packages/coordinator/src packages/coordinator/src
COPY packages/coordinator/src packages/coordinator/dist

EXPOSE 3000
CMD ["node", "packages/coordinator/dist/server.js"]

FROM base AS node

COPY packages/node/src packages/node/src
COPY packages/node/config packages/node/config

ENTRYPOINT ["node", "packages/node/dist/index.js"]
CMD ["/app/mesh.yaml"]
