# MS Catálogo · Python 3.13 + FastAPI

Responsable: Alan Fabricio Gómez Juárez. Dueño de `bd_catalogo` (recursos, categorías, existencias y reservas).

Las existencias se manejan con contadores que siempre cuadran (`disponibles + reservados + prestados + en_mantenimiento = existencias`, verificado por un `CHECK`). Cada reserva lleva el `idPrestamo` que genera Préstamos, que sirve como clave de idempotencia (D4, D7): repetir una llamada no mueve los contadores dos veces, ni siquiera si llegan dos al mismo tiempo (la reserva se bloquea con `FOR UPDATE`).

## Endpoints

| Método | Ruta | Acceso |
|---|---|---|
| GET | `/api/v1/recursos?titulo=&categoria=&estado=&pagina=&tamano=` | Autenticado (los inactivos solo el personal) |
| GET | `/api/v1/recursos/{id}` | Autenticado |
| GET | `/api/v1/categorias` | Autenticado |
| POST | `/api/v1/recursos` · PUT `/api/v1/recursos/{id}` | BIBLIOTECARIO, ADMIN |
| PATCH | `/api/v1/recursos/{id}/estado` `{ estado: DISPONIBLE \| MANTENIMIENTO \| INACTIVO }` | BIBLIOTECARIO, ADMIN |
| POST | `/api/v1/recursos/{id}/mantenimiento/reparar` | BIBLIOTECARIO, ADMIN |
| POST | `/api/v1/recursos/{id}/reservas` `{ idPrestamo, cantidad: 1 }` | Interno |
| DELETE | `/api/v1/recursos/{id}/reservas/{idPrestamo}` (liberar) | Interno |
| POST | `/api/v1/recursos/{id}/reservas/{idPrestamo}/entrega` | Interno |
| POST | `/api/v1/recursos/{id}/reservas/{idPrestamo}/devolucion` `{ danado }` | Interno |
| GET | `/api/v1/reservas?estado=RESERVADA&antesDe=` (conciliación D5) | Interno |
| GET | `/api/v1/catalogo/docs` | Documentación OpenAPI generada por FastAPI |

Estados visibles de un recurso: `DISPONIBLE`, `RESERVADO`, `PRESTADO`, `MANTENIMIENTO`, `SIN_EXISTENCIAS` (existencias = 0) e `INACTIVO`.

## Ejecutar y probar

```bash
pip install -r requirements-dev.txt
pytest --cov=app                            # 45 pruebas con SQLite en memoria
TEST_PG_URL=postgresql+psycopg://postgres:postgres@localhost:5432/bd_catalogo_test pytest tests/test_concurrencia_pg.py
                                            # 6 pruebas de concurrencia contra PostgreSQL real (PI09 y transiciones)
DB_URL=postgresql+psycopg://postgres:postgres@localhost:5432/bd_catalogo uvicorn app.main:app_produccion --factory --port 8000
python -m scripts.seed                      # 8 recursos de ejemplo
JWT_SECRET=... python -m scripts.prueba_carga --url http://localhost:8080   # RNF05: p95 de GET /recursos
```
