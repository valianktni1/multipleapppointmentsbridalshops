# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app/frontend

# Lockfile optional to avoid build crashes if it is missing
COPY package.json yarn.lock* ./
RUN yarn install --frozen-lockfile || yarn install

COPY . .
# REACT_APP_BACKEND_URL is baked at build time (CRA). Pass via build-arg.
ARG REACT_APP_BACKEND_URL
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL
RUN yarn build

# ---- serve stage ----
FROM nginx:1.27-alpine
COPY --from=build /app/frontend/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
