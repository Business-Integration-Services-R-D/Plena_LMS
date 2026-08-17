FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json yarn.lock ./
RUN corepack enable && yarn install --frozen-lockfile

COPY . .
ARG REACT_APP_BACKEND_URL=""
ARG REACT_APP_AUTH_BYPASS="false"
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL
ENV REACT_APP_AUTH_BYPASS=$REACT_APP_AUTH_BYPASS
ENV GENERATE_SOURCEMAP=false
RUN yarn build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/build /usr/share/nginx/html
EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
