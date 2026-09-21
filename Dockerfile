# syntax=docker/dockerfile:1
# Build:  docker build -t dineflow-web .
# Run:    docker run -p 8081:80 -e API_UPSTREAM=http://api:8080 dineflow-web

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx ng build --configuration production

FROM nginx:1.27-alpine AS runtime
# nginx.conf.template is rendered with envsubst by the base image's entrypoint (only ${API_UPSTREAM} is substituted).
ENV API_UPSTREAM=http://api:8080 \
    NGINX_ENVSUBST_FILTER=API_UPSTREAM \
    API_BASE_URL=/api/v1 \
    DEFAULT_TENANT_CODE=""
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
RUN chmod +x /docker-entrypoint.d/40-runtime-config.sh && sed -i 's/\r$//' /docker-entrypoint.d/40-runtime-config.sh
COPY --from=build /app/dist/dineflow-web/browser /usr/share/nginx/html
EXPOSE 80
