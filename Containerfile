# Stage 1: compile the app (TypeScript -> dist/).
FROM docker.io/library/node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.sw.json ./
COPY scripts ./scripts
COPY src ./src
COPY public ./public
RUN npm run build

# Stage 2: serve only the compiled files. Node and TypeScript are left behind.
FROM docker.io/nginxinc/nginx-unprivileged:alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
