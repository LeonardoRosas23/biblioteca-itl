# API Gateway · Nginx

Único punto de entrada público (figura 5.1). Escucha en **8080 (HTTP)** y **8443 (HTTPS)**.

- Enruta `/api/v1/*` al servicio dueño de cada recurso y `/` al panel web.
- Genera o propaga `X-Correlation-Id` (D8).
- Borra `X-Service-Token` de las peticiones externas y responde 403 a las rutas internas: reservas de Catálogo, conciliación (`/api/v1/reservas`) y `POST /api/v1/notificaciones` (con o sin barra final).
- HTTPS (RNF06): si `gateway/certs/` tiene `servidor.crt` y `servidor.key`, los usa; si no, genera un certificado autofirmado válido para `localhost`, `127.0.0.1` y `HOST_PUBLICO`. En producción, coloca ahí el certificado real y activa HSTS en `nginx.conf`.

Las rutas están en `rutas.conf`, compartidas por los dos servidores de `nginx.conf`.
