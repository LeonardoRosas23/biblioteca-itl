-- =====================================================================
-- Base de datos: bd_catalogo  (propiedad exclusiva del MS Catálogo)
-- Motor: PostgreSQL 16
-- Modelo de existencias por contador. Invariante de cada recurso:
--   disponibles + reservados + prestados + en_mantenimiento = existencias
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- búsqueda por título con LIKE sobre cualquier parte del texto

CREATE SEQUENCE IF NOT EXISTS recurso_seq START WITH 1;

CREATE TABLE IF NOT EXISTS categoria (
    codigo   VARCHAR(20) PRIMARY KEY,            -- LIBRO, EQUIPO, LABORATORIO
    nombre   VARCHAR(60) NOT NULL
);

CREATE TABLE IF NOT EXISTS recurso (
    id_recurso          VARCHAR(20)  PRIMARY KEY,           -- p. ej. R001
    titulo              VARCHAR(200) NOT NULL,
    descripcion         TEXT,
    categoria           VARCHAR(20)  NOT NULL REFERENCES categoria (codigo),
    ubicacion           VARCHAR(80)  NOT NULL,
    existencias         INTEGER      NOT NULL,
    disponibles         INTEGER      NOT NULL,
    reservados          INTEGER      NOT NULL DEFAULT 0,
    prestados           INTEGER      NOT NULL DEFAULT 0,
    en_mantenimiento    INTEGER      NOT NULL DEFAULT 0,
    estado              VARCHAR(15)  NOT NULL DEFAULT 'ACTIVO',   -- estado administrativo
    fecha_registro      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_recurso_estado   CHECK (estado IN ('ACTIVO','MANTENIMIENTO','INACTIVO')),
    CONSTRAINT ck_recurso_no_neg   CHECK (existencias >= 0 AND disponibles >= 0 AND reservados >= 0
                                          AND prestados >= 0 AND en_mantenimiento >= 0),
    CONSTRAINT ck_recurso_cuadra   CHECK (disponibles + reservados + prestados + en_mantenimiento = existencias)
);

-- La búsqueda compara lower(titulo) con LIKE, así que el índice debe ser sobre la misma expresión
DROP INDEX IF EXISTS ix_recurso_titulo_trgm;
CREATE INDEX IF NOT EXISTS ix_recurso_titulo_lower_trgm ON recurso USING gin (lower(titulo) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_recurso_categoria   ON recurso (categoria, estado);

-- Una reserva por préstamo; idPrestamo lo genera Préstamos (D4) y sirve como clave de idempotencia.
CREATE TABLE IF NOT EXISTS reserva (
    id_prestamo         VARCHAR(20)  PRIMARY KEY,
    id_recurso          VARCHAR(20)  NOT NULL REFERENCES recurso (id_recurso),
    estado              VARCHAR(10)  NOT NULL DEFAULT 'RESERVADA',
    fecha_creacion      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_reserva_estado CHECK (estado IN ('RESERVADA','ENTREGADA','LIBERADA','DEVUELTA'))
);

CREATE INDEX IF NOT EXISTS ix_reserva_recurso ON reserva (id_recurso, estado);
-- Conciliación (D5): reservas sin recoger por antigüedad
CREATE INDEX IF NOT EXISTS ix_reserva_estado_fecha ON reserva (estado, fecha_creacion);
