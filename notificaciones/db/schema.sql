-- =====================================================================
-- Base de datos: bd_notificaciones  (propiedad exclusiva del MS Notificaciones)
-- Motor: PostgreSQL 16
-- Cada aviso se guarda ANTES de intentar enviarlo (sección 6.5): si el envío falla
-- queda FALLIDA con proximo_reintento hasta agotar los intentos.
-- =====================================================================

CREATE SEQUENCE IF NOT EXISTS notificacion_seq START WITH 1;

CREATE TABLE IF NOT EXISTS notificacion (
    id_notificacion     VARCHAR(20)  PRIMARY KEY,                -- N-0001
    id_usuario          VARCHAR(20)  NOT NULL,                   -- ref. lógica a Usuarios
    id_prestamo         VARCHAR(20),                             -- ref. lógica opcional a Préstamos
    tipo                VARCHAR(15)  NOT NULL,
    mensaje             VARCHAR(500) NOT NULL,
    canal               VARCHAR(10)  NOT NULL DEFAULT 'APP',
    estado              VARCHAR(10)  NOT NULL DEFAULT 'PENDIENTE',
    leida               BOOLEAN      NOT NULL DEFAULT FALSE,
    clave_idempotencia  VARCHAR(120),
    intentos            INTEGER      NOT NULL DEFAULT 0,
    proximo_reintento   TIMESTAMPTZ,
    ultimo_error        VARCHAR(300),
    fecha_creacion      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_envio         TIMESTAMPTZ,
    CONSTRAINT ck_notif_tipo   CHECK (tipo IN ('CONFIRMACION','RECORDATORIO','ALERTA_MULTA','VENCIMIENTO')),
    CONSTRAINT ck_notif_estado CHECK (estado IN ('PENDIENTE','ENVIADA','FALLIDA')),
    CONSTRAINT ck_notif_canal  CHECK (canal IN ('APP','CORREO')),
    CONSTRAINT ck_notif_intent CHECK (intentos >= 0)
);

-- Idempotencia (D7): repetir el POST con la misma clave no crea un duplicado
CREATE UNIQUE INDEX IF NOT EXISTS ux_notif_clave ON notificacion (clave_idempotencia) WHERE clave_idempotencia IS NOT NULL;
-- Bandeja del usuario, más recientes primero
CREATE INDEX IF NOT EXISTS ix_notif_usuario ON notificacion (id_usuario, fecha_creacion DESC);
-- Trabajador de reintentos
CREATE INDEX IF NOT EXISTS ix_notif_reintento ON notificacion (estado, proximo_reintento);
