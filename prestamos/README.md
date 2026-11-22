# MS Préstamos y Multas · Java 21 + Spring Boot 3.4

Responsable: José de Jesús González Gallegos. Dueño de `bd_prestamos`. Orquesta el flujo (D1): es el único servicio que llama a Usuarios, Catálogo y Notificaciones.

- Las transiciones de estado viven en la entidad `Prestamo` (figura 4.2); cualquier otra da 409.
- Los cambios en Catálogo y los avisos se guardan en la bandeja de salida (`evento_pendiente`) en la misma transacción que el préstamo y se envían con reintentos (D6). Los de Catálogo se aplican **en orden por préstamo** (la devolución espera a la entrega).
- Si Catálogo no responde al reservar, la reserva se libera por si alcanzó a crearse (PI19). Cada 10 min una tarea concilia reservas sin préstamo vigente (D5).
- Dos solicitudes simultáneas del mismo usuario se serializan con un candado por usuario (`cupo_usuario`), así el límite de préstamos no se rebasa (RN03).
- Un préstamo ACTIVO con la fecha límite vencida bloquea nuevas solicitudes aunque la tarea diaria aún no lo marque VENCIDO.
- Las multas tienen bloqueo optimista: dos cobros simultáneos de la misma multa dan 409 al segundo.

## Endpoints

| Método | Ruta | Acceso |
|---|---|---|
| POST | `/api/v1/prestamos` `{ idRecurso }` | ALUMNO, PROFESOR |
| GET | `/api/v1/prestamos?idUsuario=&estado=&folio=&pagina=&tamano=` | Propios · personal |
| GET | `/api/v1/prestamos/{id}` | Propietario · personal |
| PATCH | `/api/v1/prestamos/{id}/aprobar` | BIBLIOTECARIO, ADMIN |
| POST | `/api/v1/prestamos/{id}/devolucion` `{ danado }` | BIBLIOTECARIO, ADMIN |
| POST | `/api/v1/prestamos/{id}/renovacion` | Propietario |
| GET | `/api/v1/multas?idUsuario=&estadoPago=` | Propias · personal |
| PATCH | `/api/v1/multas/{id}/estado` `{ estadoPago: PAGADA \| CANCELADA }` | BIBLIOTECARIO, ADMIN |

Tareas programadas: vencimientos y recordatorios (`CRON_VENCIMIENTOS`, 8:00 a. m.), reservas expiradas (`EXPIRAR_RESERVAS_MS`), bandeja de salida (`EVENTOS_MS`) y conciliación (`CONCILIAR_MS`).

## Ejecutar y probar

```bash
mvn test                  # JUnit 5 con H2 en memoria y los otros servicios simulados; no necesita PostgreSQL
mvn spring-boot:run       # con DB_URL/DB_USER/DB_PASSWORD de una base PostgreSQL
```

Parámetros de negocio (sección 2.3) y demás variables en `.env.example`. El esquema (`src/main/resources/schema.sql`) se aplica al arrancar y actualiza bases creadas con la versión anterior. Datos de demostración: `db/demo.sql` (los carga `scripts/cargar-datos-demo.sh`).
