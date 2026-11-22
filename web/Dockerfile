FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx vitest run && npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
# Rutas del panel (React Router): cualquier ruta sin archivo devuelve index.html
RUN printf 'server { listen 80; root /usr/share/nginx/html; location / { try_files $uri /index.html; } }\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80
