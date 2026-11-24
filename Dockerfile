# syntax=docker/dockerfile:1

FROM node:22-alpine

WORKDIR /app

# Node 22 ships npm 10. This lockfile was written by npm 11, and npm 10
# rejects it while installing the MCP SDK's zod peer dependency.
# --ignore-scripts skips optional native addons that Alpine cannot compile.
COPY package.json package-lock.json ./
RUN npm install -g npm@11.20.0 \
 && npm ci --omit=dev --ignore-scripts \
 && npm cache clean --force

COPY index.js server.js client.js ./

ENV NODE_ENV=production

USER node

CMD ["node", "index.js"]
