FROM nginx:1.27-alpine
RUN apk add --no-cache openssl
COPY nginx.conf /etc/nginx/nginx.conf
COPY rutas.conf /etc/nginx/rutas.conf
# Las imágenes oficiales de nginx ejecutan los scripts de /docker-entrypoint.d/ antes de arrancar
COPY 15-certificado.sh /docker-entrypoint.d/15-certificado.sh
RUN chmod +x /docker-entrypoint.d/15-certificado.sh && mkdir -p /etc/nginx/certs
EXPOSE 80 443
