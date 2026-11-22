# MS Usuarios y Autenticación · Node.js 22 + Express

Responsable: María Fernanda Navarro Negrete. Dueño de `bd_usuarios` (cuentas, roles y estado). Emite el JWT que los demás servicios verifican por su cuenta (D2).

## Endpoints

| Método | Ruta | Acceso | Respuestas |
|---|---|---|---|
| POST | `/api/v1/auth/login` | Público | 200, 400, 401, 403 (cuenta bloqueada/inactiva), 429 (demasiados intentos) |
| POST | `/api/v1/usuarios` | Público (ALUMNO/PROFESOR) · ADMIN (cualquier rol) | 201, 400, 403, 409 |
| GET | `/api/v1/usuarios/me` | Autenticado | 200, 401 |
| GET | `/api/v1/usuarios?q=&rol=&pagina=&tamano=` | BIBLIOTECARIO, ADMIN | 200, 401, 403 |
| GET | `/api/v1/usuarios/{id}/estado` | Interno (X-Service-Token) · BIBLIOTECARIO, ADMIN | 200, 404 |
| PATCH | `/api/v1/usuarios/{id}/estado` | ADMIN · `{ estado?, rol? }` | 200, 400, 403, 404, 409 |
| GET | `/health` | Público | 200 |

Seguridad: contraseñas con bcrypt; el mensaje de error del login no dice si falló el correo o la contraseña, y tarda lo mismo en ambos casos; tras `LOGIN_MAX_INTENTOS` fallos en `LOGIN_VENTANA_SEG` el correo queda en espera (429 con `Retry-After`). Un ADMIN no puede bloquearse ni quitarse su propio rol.

## Variables de entorno

Ver `.env.example`. `JWT_SECRET` debe ser igual en los cuatro servicios y tener al menos 32 caracteres. `DOMINIO_CORREO` limita el registro al correo institucional (vacío = cualquier dominio).

## Ejecutar y probar

```bash
npm install
npm test                                    # 34 pruebas (Jest + Supertest), repositorio en memoria
DB_URL=postgres://postgres:postgres@localhost:5432/bd_usuarios npm start
node scripts/seed.js                        # usuarios de prueba (contraseña Biblio2026!)
```

El esquema está en `db/schema.sql` y se aplica al arrancar.
