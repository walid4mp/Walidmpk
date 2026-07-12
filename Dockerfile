FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4200
ENV RENDER=false
ENV DATABASE_URL=sqlite:///app/data/warhex.sqlite
ENV UPLOAD_DIR=/app/uploads

COPY --from=build /app /app
RUN mkdir -p /app/data /app/uploads && chown -R node:node /app

USER node
EXPOSE 4200
CMD ["npm", "start"]
