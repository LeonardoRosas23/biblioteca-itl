# Sistema de Gestión de Préstamo de Recursos Bibliotecarios · ITL

[![Pruebas](https://github.com/LeonardoRosas23/biblioteca-itl/actions/workflows/pruebas.yml/badge.svg)](https://github.com/LeonardoRosas23/biblioteca-itl/actions/workflows/pruebas.yml)

Proyecto Integrador de Aplicaciones Empresariales 2026-2 · Segundo avance de implementación (versión para despliegue).

Arquitectura de microservicios políglota con clientes web y móvil:

| Carpeta | Componente | Tecnología | Puerto | Responsable |
|---|---|---|---|---|
| `usuarios/` | MS Usuarios y Autenticación | Node.js 22 + Express | 3001 | María Fernanda Navarro |
| `catalogo/` | MS Catálogo | Python 3.13 + FastAPI | 8000 | Alan Fabricio Gómez |
| `prestamos/` | MS Préstamos y Multas | Java 21 + Spring Boot 3.4 | 8080 | José de Jesús González |
| `notificaciones/` | MS Notificaciones | Go 1.24 + Fiber v2 | 8090 | Erika Josabet Luna |
| `web/` | Panel administrativo | React 18 + Vite | 5173 (dev) | Erika Josabet Luna |
| `movil/` | App del usuario | React Native (Expo SDK 52) | — | Alan Fabricio Gómez |
| `gateway/` | API Gateway | Nginx | 8080 HTTP · 8443 HTTPS (host) | Alan Fabricio Gómez |
| `pruebas-integracion/` | Pruebas entre servicios y de punta a punta | Python + httpx | — | Leonardo Daniel Rosas |
| `docs/` | Bases de datos, cambios al diseño, evidencia y capturas | — | — | Leonardo Daniel Rosas |

Cada servicio tiene su propio README con sus endpoints, variables y pruebas. Cada uno es dueño de su base PostgreSQL y la crea al arrancar (diagramas en [`docs/base-de-datos.md`](docs/base-de-datos.md)). En qué difiere lo implementado de la propuesta y del documento de diseño: [`docs/cambios-al-diseno.md`](docs/cambios-al-diseno.md).

## Arranque completo con Docker

```bash
cp .env.example .env                 # cambia los secretos; HOST_PUBLICO = IP de tu PC (para HTTPS y la app)
docker compose up -d --build
./scripts/cargar-datos-demo.sh       # usuarios, catálogo, préstamos en cada estado, una multa y avisos
```

- Panel: http://localhost:8080 · https://localhost:8443 (certificado autofirmado; el navegador pedirá aceptarlo)
- API: http://localhost:8080/api/v1/… · Documentación de Catálogo: http://localhost:8080/api/v1/catalogo/docs
- App móvil: `cd movil && EXPO_PUBLIC_API_URL=http://<HOST_PUBLICO>:8080 npx expo start`

Cuentas de prueba (contraseña `Biblio2026!` en desarrollo; en el servidor, la `SEED_PASSWORD` que genera la instalación):

| Correo | Rol | Qué tiene en los datos de demostración |
|---|---|---|
| admin@itleon.edu.mx | ADMIN | Panel completo, incluida la sección Usuarios |
| biblioteca@itleon.edu.mx | BIBLIOTECARIO | Panel: recursos, préstamos y multas |
| ana.alumna@itleon.edu.mx | ALUMNO | Un préstamo por recoger y uno que vence mañana |
| beto.alumno@itleon.edu.mx | ALUMNO | Un préstamo vencido y una multa de $30.00 pendiente (no puede pedir más) |
| carla.profe@itleon.edu.mx | PROFESOR | Uno activo que puede renovar, uno devuelto y uno rechazado |

## Pruebas

| Componente | Comando | Resultado en GitHub Actions (22/11/2026) |
|---|---|---|
| Usuarios | `cd usuarios && npm install && npm test` | 34/34 · 97 % líneas |
| Catálogo | `cd catalogo && pip install -r requirements-dev.txt && pytest --cov=app` | 51/51 (6 de concurrencia con PostgreSQL) · 93 % |
| Préstamos | `cd prestamos && mvn test` | 92/92 |
| Notificaciones | `cd notificaciones && go mod tidy && go test -race ./...` | Todos los paquetes, incluidos la API (Fiber) y PostgreSQL |
| Panel web | `cd web && npm install && npm test` | 48/48 · 98 % líneas |
| App móvil | `cd movil && npm install --legacy-peer-deps && npm test` | 28/28 · 95 % líneas |
| Integración front–back | ver abajo | Panel 3/3 · App 2/2, contra el sistema completo |
| Punta a punta PI01–PI19 | `python pruebas-integracion/e2e_gateway.py` | **22/22** ([`docs/evidencia/e2e_gateway.txt`](docs/evidencia/e2e_gateway.txt)) |
| Rendimiento RNF05 | `cd catalogo && python -m scripts.prueba_carga` | p95 = 88 ms por el gateway (objetivo < 300 ms) |

### Pruebas con el sistema completo (segundo avance)

Con el sistema levantado con el ajuste de pruebas (las tareas programadas corren cada pocos segundos):

```bash
docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d --build
./scripts/cargar-datos-demo.sh

python pruebas-integracion/e2e_gateway.py                         # PI01–PI19, rutas internas, D8 y HTTPS
cd web   && VITE_API_URL=http://localhost:8080 npx vitest run src/test/integracion.test.jsx
cd movil && E2E=1 EXPO_PUBLIC_API_URL=http://localhost:8080 npx jest __tests__/integracion.test.jsx
```

- `e2e_gateway.py` recorre los 19 casos de la sección 6.7 a través del gateway. Para PI18 y PI19 detiene y vuelve a arrancar Notificaciones, Catálogo y Usuarios. Deja el reporte en `docs/evidencia/e2e_gateway.txt`.
- Las pruebas de integración de `web` y `movil` manejan las pantallas reales (login, alta de recurso, registro, solicitud de préstamo) contra el backend, sin simular la API.

## Integración continua y despliegue

- **Pruebas en GitHub Actions** (`.github/workflows/pruebas.yml`): en cada push a `main` corren las pruebas de los seis componentes (incluidos `mvn test` y `go test -race`) y el sistema completo con Docker: integración front–back, PI01–PI19 y la prueba de carga. Los reportes quedan como *Artifacts* de cada ejecución.
- **APK de Android** (`.github/workflows/apk.yml`): Actions → *APK Android* → *Run workflow* con la dirección del servidor. El APK queda en la página de Releases.
- **Servidor en la nube con HTTPS** (Caddy + Let's Encrypt) en Azure for Students, sin tarjeta: guía en [`docs/despliegue.md`](docs/despliegue.md). Alternativa con Oracle Cloud: [`docs/despliegue-oracle.md`](docs/despliegue-oracle.md). El script `deploy/instalar.sh` sirve para cualquier servidor Ubuntu.

Todo esto ya corrió y pasa en GitHub Actions. Lo único que se hace a mano: las capturas de la app móvil ([`docs/capturas/LEEME.md`](docs/capturas/LEEME.md)) y la prueba de arranque en un segundo equipo (RNF02).

## Desarrollo sin Docker

```bash
# PostgreSQL local con las bases bd_usuarios, bd_catalogo, bd_prestamos, bd_notificaciones
export JWT_SECRET=un-secreto-de-al-menos-32-caracteres SERVICE_TOKEN=token-interno
cd usuarios && DB_URL=postgres://postgres:postgres@localhost:5432/bd_usuarios npm start
cd catalogo && DB_URL=postgresql+psycopg://postgres:postgres@localhost:5432/bd_catalogo uvicorn app.main:app_produccion --factory --port 8000
cd prestamos && mvn spring-boot:run
cd notificaciones && go run ./cmd/servidor
cd web && npm run dev            # el proxy de Vite enruta /api/v1/* a cada servicio
cd movil && EXPO_PUBLIC_API_URL=http://<IP-de-tu-PC>:8080 npx expo start
```

`JWT_SECRET` debe ser el mismo en los cuatro servicios y tener al menos 32 caracteres (lo exige jjwt en Java).
