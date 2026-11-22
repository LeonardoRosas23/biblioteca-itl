# MS Notificaciones · Go 1.24 + Fiber v2

Responsable: Erika Josabet Luna García. Dueño de `bd_notificaciones`.

Cada aviso se guarda **antes** de intentar enviarlo; si el envío falla queda `FALLIDA` con `proximoReintento` (30 s, 1 min, 2 min…) hasta agotar `MAX_REINTENTOS` (figura 6.5). Un trabajador revisa los pendientes cada 30 s. La cabecera `Idempotency-Key` evita duplicados aunque Préstamos repita el envío (D7). El canal actual es la bandeja de la app (`APP`); el correo queda como opción detrás de la interfaz `Canal`.

## Endpoints

| Método | Ruta | Acceso |
|---|---|---|
| POST | `/api/v1/notificaciones` (+ `Idempotency-Key`) | Interno |
| GET | `/api/v1/notificaciones?noLeidas=&pagina=&tamano=` | Autenticado (sus avisos; el personal puede filtrar por `idUsuario`) |
| GET | `/api/v1/notificaciones/{id}` | Destinatario · personal · interno |
| PATCH | `/api/v1/notificaciones/{id}/leida` | Destinatario |

Tipos: `CONFIRMACION`, `RECORDATORIO`, `ALERTA_MULTA`, `VENCIMIENTO`.

## Ejecutar y probar

```bash
go mod tidy
go test -race ./...       # dominio, JWT, servicio (memoria), API (Fiber)
go run ./cmd/servidor     # con DB_URL de PostgreSQL
```

El JWT se verifica con la biblioteca estándar (`internal/seguridad`), sin dependencias externas. El esquema está en `db/schema.sql`.
