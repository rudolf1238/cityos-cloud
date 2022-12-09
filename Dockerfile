FROM node:16-alpine as builder

ENV NODE_ENV build

WORKDIR /app/node

COPY ./node/package*.json ./
RUN npm ci --legacy-peer-deps

WORKDIR /app

COPY ./node ./node
COPY ./env/cityos_env ./env/cityos_env

WORKDIR /app/node

COPY --chown=node:node . .
RUN npm run build \
  && npm prune --omit=dev --legacy-peer-deps

## ---

FROM node:16-alpine

WORKDIR /app/node

COPY --from=builder --chown=node:node /app/node/package*.json ./
COPY --from=builder --chown=node:node /app/node/node_modules/ ./node_modules/
COPY --from=builder --chown=node:node /app/node/dist/ ./dist/
COPY --from=builder --chown=node:node /app/node/src/schema/ ./schema/
COPY --from=builder --chown=node:node /app/env/ ../env/

ENV NODE_ENV production

## ---

EXPOSE 4000

CMD [ "node", "dist/src/main.js" ]
