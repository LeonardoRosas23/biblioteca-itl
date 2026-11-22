# Pendientes de la revisión del 21/11/2026 y cómo quedaron

✅ hecho y probado · 🟡 hecho, falta correrlo en una máquina con Docker / Maven / Go · 👤 lo tiene que hacer el equipo

## Segundo avance (18 de noviembre)

| # | Pendiente | Estado | Dónde |
|---|---|---|---|
| 1 | Pruebas de integración front–back | 🟡 | `web/src/test/integracion.test.jsx`, `movil/__tests__/integracion.test.jsx`. Login, alta de recurso, panel de administrador y registro desde la app ya pasaron contra Usuarios y Catálogo reales; falta correrlas con el sistema completo |
| 2 | Integrar Préstamos y Notificaciones con los demás | 🟡 | `pruebas-integracion/e2e_gateway.py` (PI01–PI19 por el gateway) |
| 3 | Evidencia de `docker compose up` (RNF02) | 🟡 | `docker compose config` valida; falta levantarlo en dos equipos |
| 4 | Compilar adaptadores de Notificaciones | 🟡 | `go mod tidy && go test -race ./...` |
| 5 | Datos de prueba de préstamos, multas y avisos | ✅ | `scripts/cargar-datos-demo.sh` y `*/db/demo.sql` (probado dos veces seguidas en PostgreSQL) |
| 6 | Versión final desplegada | 👤 | README → "Arranque completo con Docker" |

## Funcionalidad

| # | Pendiente | Estado | Dónde |
|---|---|---|---|
| 7 | Registro en la app móvil | ✅ | `movil/src/pantallas/Registro.jsx` (+5 pruebas) |
| 8 | Conciliación de reservas (D5) | 🟡 | Catálogo `GET /api/v1/reservas` ✅ · Préstamos `conciliarReservas()` cada 10 min 🟡 |
| 9 | Pantalla para bloquear cuentas y asignar roles | ✅ | `web/src/paginas/Usuarios.jsx` (solo ADMIN, +8 pruebas) |
| 10 | HTTPS en el gateway | ✅ | Puerto 8443; certificado autofirmado o el de `gateway/certs/` |

## Errores

| # | Pendiente | Estado | Dónde |
|---|---|---|---|
| 11 | Reserva huérfana cuando Catálogo no responde | 🟡 | `PrestamoService.solicitar`: ante 503 libera la reserva (o la deja en la bandeja) |
| 12 | Devolución duplicada en Catálogo | ✅ | `servicio._transicion` con `FOR UPDATE` y verificación; probado con 2 hilos en PostgreSQL |
| 13 | Eventos de Catálogo en desorden | 🟡 | `EventoService`: la devolución espera a la entrega; si la entrega falló, se deja para revisión |
| 14 | Límite de préstamos con solicitudes simultáneas | 🟡 | Candado por usuario (`cupo_usuario`, `SELECT … FOR UPDATE`) |
| 15 | Préstamo atrasado antes de la tarea de las 8:00 | 🟡 | `solicitar` también revisa ACTIVO con fecha vencida |

## Pruebas

| # | Pendiente | Estado | Dónde |
|---|---|---|---|
| 16 | PI19 con Catálogo caído al reservar | 🟡 | `CorreccionesNoviembreTest` (JUnit) y `e2e_gateway.py` |
| 17 | PI17 y PI18 de punta a punta | 🟡 | `e2e_gateway.py` con `docker-compose.e2e.yml` |
| 18 | Prueba de carga RNF05 | ✅ | p95 = 224 ms · `docs/evidencia/catalogo_carga_rnf05.txt` |
| 19 | PI01–PI19 por el gateway | 🟡 | `e2e_gateway.py` |

## Evidencia y documentación

| # | Pendiente | Estado | Dónde |
|---|---|---|---|
| 20 | Capturas reales de la app | 👤 | Instrucciones en `docs/capturas/LEEME.md`; las del panel se renombraron `panel-*` |
| 21 | README por servicio | ✅ | `*/README.md` |
| 22 | Diagramas entidad-relación | ✅ | `docs/base-de-datos.md` |
| 23 | README general desactualizado | ✅ | `README.md` |
| 24 | Cambios al documento de diseño | ✅ | `docs/cambios-al-diseno.md` (falta pasarlos al PDF 👤) |
| 25 | Justificar el cambio de stack y responsables | ✅ | `docs/cambios-al-diseno.md`, sección 1 |
| 26 | Quitar `.env`, `target/` y `.expo/` | ✅ | El zip entregado ya no los incluye; `prestamos_junit.txt` guarda los resultados que había en `target/` |

## Menores

| # | Pendiente | Estado |
|---|---|---|
| 27 | `%` y `_` en búsquedas `LIKE` | ✅ Catálogo y Usuarios (probado en PostgreSQL) |
| 28 | Registro simultáneo con el mismo correo da 500 | ✅ Ahora 409 (probado en PostgreSQL) |
| 29 | Tiempo de respuesta del login revela si el correo existe | ✅ Siempre se compara con bcrypt |
| 30 | Límite de intentos de login | ✅ 5 fallos en 15 min → 429 (configurable) |
| 31 | `@Version` en multas | 🟡 Columna `version` y prueba de cobro simultáneo |
| 32 | Índice trigram que no se usaba | ✅ Ahora sobre `lower(titulo)` |
| 33 | Recurso con 0 existencias aparecía en mantenimiento | ✅ Nuevo estado `SIN_EXISTENCIAS` ("Sin existencias") |
| 34 | `POST /api/v1/notificaciones/` con barra final | ✅ Bloqueado en el gateway; también `/api/v1/reservas` |

Extras de la misma revisión: un ADMIN ya no puede quitarse su propio rol; el gateway ya no duplica `X-Correlation-Id`.
