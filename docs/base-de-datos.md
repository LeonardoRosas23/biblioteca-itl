# Diseño de las bases de datos

Cada microservicio es dueño de su propia base PostgreSQL 16, con un usuario que solo tiene acceso a ella (RNF03). Las referencias entre servicios (`id_usuario`, `id_recurso`, `id_prestamo`) se guardan como identificadores **sin llave foránea**, porque viven en bases distintas; la integridad entre servicios la cuidan las APIs (sección 4.3).

| Base | Servicio | Esquema |
|---|---|---|
| `bd_usuarios` | Usuarios (Node.js) | `usuarios/db/schema.sql` |
| `bd_catalogo` | Catálogo (Python) | `catalogo/db/schema.sql` |
| `bd_prestamos` | Préstamos (Java) | `prestamos/src/main/resources/schema.sql` |
| `bd_notificaciones` | Notificaciones (Go) | `notificaciones/db/schema.sql` |

Los diagramas usan la notación de Mermaid (GitHub y la mayoría de los editores de Markdown los dibujan). Las líneas punteadas entre bases son referencias lógicas, no llaves foráneas.

## Vista general

```mermaid
erDiagram
    USUARIO ||..o{ PRESTAMO : "id_usuario (lógica)"
    RECURSO ||..o{ PRESTAMO : "id_recurso (lógica)"
    RECURSO ||--o{ RESERVA : "FK"
    PRESTAMO ||..o| RESERVA : "id_prestamo (lógica)"
    PRESTAMO ||--o{ MULTA : "FK"
    USUARIO ||..o{ NOTIFICACION : "id_usuario (lógica)"
    PRESTAMO ||..o{ NOTIFICACION : "id_prestamo (lógica)"
```

## bd_usuarios

```mermaid
erDiagram
    USUARIO {
        varchar id_usuario PK "U100, U101…"
        varchar nombre
        varchar correo UK "minúsculas"
        varchar password_hash "bcrypt"
        varchar rol "ALUMNO | PROFESOR | BIBLIOTECARIO | ADMIN"
        varchar estado "ACTIVO | BLOQUEADO | INACTIVO"
        timestamptz fecha_registro
        timestamptz fecha_actualizacion
    }
```

Índices: único sobre `correo`; `lower(nombre)` para búsquedas del panel.

## bd_catalogo

```mermaid
erDiagram
    CATEGORIA ||--o{ RECURSO : clasifica
    RECURSO ||--o{ RESERVA : "una por préstamo"
    CATEGORIA {
        varchar codigo PK "LIBRO | EQUIPO | LABORATORIO"
        varchar nombre
    }
    RECURSO {
        varchar id_recurso PK "R001…"
        varchar titulo
        text descripcion
        varchar categoria FK
        varchar ubicacion
        int existencias
        int disponibles
        int reservados
        int prestados
        int en_mantenimiento
        varchar estado "ACTIVO | MANTENIMIENTO | INACTIVO"
        timestamptz fecha_registro
        timestamptz fecha_actualizacion
    }
    RESERVA {
        varchar id_prestamo PK "lo genera Préstamos (idempotencia)"
        varchar id_recurso FK
        varchar estado "RESERVADA | ENTREGADA | LIBERADA | DEVUELTA"
        timestamptz fecha_creacion
        timestamptz fecha_actualizacion
    }
```

Restricciones: `disponibles + reservados + prestados + en_mantenimiento = existencias` y ningún contador negativo. Índices: trigramas sobre `lower(titulo)` (búsqueda por cualquier parte del título), `(categoria, estado)`, `(id_recurso, estado)` y `(estado, fecha_creacion)` para la conciliación.

## bd_prestamos

```mermaid
erDiagram
    PRESTAMO ||--o{ MULTA : genera
    PRESTAMO {
        varchar id_prestamo PK "P-0100…"
        varchar id_usuario "ref. Usuarios"
        varchar id_recurso "ref. Catálogo"
        varchar titulo_recurso "copia para el historial"
        varchar categoria_recurso "copia para el plazo"
        varchar estado "PENDIENTE_ENTREGA | ACTIVO | VENCIDO | FINALIZADO | RECHAZADO"
        varchar motivo "obligatorio si RECHAZADO"
        timestamptz fecha_solicitud
        timestamptz reserva_vigente_hasta
        timestamptz fecha_entrega
        date fecha_devolucion_estimada
        timestamptz fecha_devolucion_real
        int renovaciones
        boolean recurso_danado
        bigint version "bloqueo optimista"
    }
    MULTA {
        varchar id_multa PK "M-0001…"
        varchar id_prestamo FK
        varchar id_usuario
        int dias_retraso
        numeric tarifa_diaria "tarifa vigente al generarla"
        numeric monto_calculado
        varchar estado_pago "PENDIENTE | PAGADA | CANCELADA"
        timestamptz fecha_generacion
        timestamptz fecha_resolucion
        bigint version "bloqueo optimista"
    }
    EVENTO_PENDIENTE {
        bigint id_evento PK
        varchar tipo "NOTIFICACION | CATALOGO_LIBERAR | CATALOGO_ENTREGA | CATALOGO_DEVOLUCION"
        text payload "JSON"
        varchar clave_idempotencia UK
        varchar id_prestamo "orden por préstamo"
        varchar estado "PENDIENTE | ENVIADO | FALLIDO"
        int intentos
        timestamptz proximo_intento
        varchar ultimo_error
        timestamptz fecha_creacion
        timestamptz fecha_envio
    }
    SOLICITUD_ESPERA {
        bigint id_solicitud PK
        varchar id_recurso
        varchar id_usuario
        timestamptz fecha_registro
        boolean atendida
    }
    CUPO_USUARIO {
        varchar id_usuario PK "candado por usuario (RN03)"
    }
```

- `evento_pendiente` es la bandeja de salida (D6): se escribe en la misma transacción que el préstamo.
- `solicitud_espera` registra la demanda no atendida que impide renovar (RN06).
- `cupo_usuario` solo se usa para `SELECT … FOR UPDATE`: serializa las solicitudes simultáneas de un mismo usuario.

## bd_notificaciones

```mermaid
erDiagram
    NOTIFICACION {
        varchar id_notificacion PK "N-0001…"
        varchar id_usuario "ref. Usuarios"
        varchar id_prestamo "ref. Préstamos (opcional)"
        varchar tipo "CONFIRMACION | RECORDATORIO | ALERTA_MULTA | VENCIMIENTO"
        varchar mensaje "máx. 500"
        varchar canal "APP | CORREO"
        varchar estado "PENDIENTE | ENVIADA | FALLIDA"
        boolean leida
        varchar clave_idempotencia UK "parcial: si no es nula"
        int intentos
        timestamptz proximo_reintento
        varchar ultimo_error
        timestamptz fecha_creacion
        timestamptz fecha_envio
    }
```

Índices: único parcial sobre `clave_idempotencia`, `(id_usuario, fecha_creacion DESC)` para la bandeja y `(estado, proximo_reintento)` para el trabajador de reintentos.
