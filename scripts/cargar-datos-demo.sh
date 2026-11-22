#!/usr/bin/env bash
# Carga los datos de prueba en las cuatro bases (requiere `docker compose up -d` ya corriendo).
#   - Usuarios: admin, bibliotecaria, 2 alumnos y 1 profesora (contraseña: SEED_PASSWORD del .env)
#   - Catálogo: 8 recursos y las reservas de los préstamos de demostración
#   - Préstamos: un préstamo en cada estado y una multa pendiente
#   - Notificaciones: avisos ya enviados de esos préstamos
# Se puede correr varias veces sin duplicar nada.
set -euo pipefail
cd "$(dirname "$0")/.."
DC=${DC:-docker compose}

esperar() {  # esperar <servicio> <tabla> <base> <usuario>
  for _ in $(seq 1 60); do
    if $DC exec -T "$1" psql -U "$4" -d "$3" -tAc "select 1 from $2 limit 1" >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  echo "La tabla $2 de $3 no existe todavía: ¿arrancó el servicio dueño?" >&2
  exit 1
}

echo "== Usuarios"
$DC exec -T usuarios node scripts/seed.js
echo "== Catálogo"
$DC exec -T catalogo python -m scripts.seed
$DC exec -T db-catalogo psql -q -v ON_ERROR_STOP=1 -U catalogo_app -d bd_catalogo < catalogo/db/demo.sql
echo "== Préstamos"
esperar db-prestamos prestamo bd_prestamos prestamos_app
$DC exec -T db-prestamos psql -q -v ON_ERROR_STOP=1 -U prestamos_app -d bd_prestamos < prestamos/db/demo.sql >/dev/null
echo "== Notificaciones"
esperar db-notificaciones notificacion bd_notificaciones notificaciones_app
$DC exec -T db-notificaciones psql -q -v ON_ERROR_STOP=1 -U notificaciones_app -d bd_notificaciones < notificaciones/db/demo.sql >/dev/null
echo "Listo. Panel: http://localhost:8080 (biblioteca@itleon.edu.mx y la SEED_PASSWORD de tu .env)"
