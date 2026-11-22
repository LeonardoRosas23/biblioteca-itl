-- =====================================================================
-- Base de datos: bd_usuarios  (propiedad exclusiva del MS Usuarios)
-- Motor: PostgreSQL 16
-- =====================================================================

CREATE SEQUENCE IF NOT EXISTS usuario_seq START WITH 100;

CREATE TABLE IF NOT EXISTS usuario (
    id_usuario           VARCHAR(20)  PRIMARY KEY,               -- p. ej. U100
    nombre               VARCHAR(120) NOT NULL,
    correo               VARCHAR(160) NOT NULL,
    password_hash        VARCHAR(100) NOT NULL,                  -- bcrypt (incluye sal)
    rol                  VARCHAR(15)  NOT NULL,
    estado               VARCHAR(10)  NOT NULL DEFAULT 'ACTIVO',
    fecha_registro       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_usuario_rol    CHECK (rol IN ('ALUMNO','PROFESOR','BIBLIOTECARIO','ADMIN')),
    CONSTRAINT ck_usuario_estado CHECK (estado IN ('ACTIVO','BLOQUEADO','INACTIVO')),
    CONSTRAINT ck_usuario_correo CHECK (correo = lower(correo) AND position('@' in correo) > 1)
);

-- El correo es la llave natural de inicio de sesión
CREATE UNIQUE INDEX IF NOT EXISTS ux_usuario_correo ON usuario (correo);
-- Búsquedas del panel por nombre
CREATE INDEX IF NOT EXISTS ix_usuario_nombre ON usuario (lower(nombre));
