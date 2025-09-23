# syntax=docker/dockerfile:1.5

FROM node:22

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN corepack enable

EXPOSE 3000

CMD ["sh", "-c", "corepack enable && pnpm install && HOSTNAME=0.0.0.0 PORT=3000 pnpm dev"]
