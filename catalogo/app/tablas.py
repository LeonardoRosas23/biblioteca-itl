"""Definición de tablas con SQLAlchemy Core. En PostgreSQL el DDL oficial es db/schema.sql;
estas definiciones permiten crear el mismo esquema en SQLite para las pruebas unitarias."""
from datetime import datetime, timezone

from sqlalchemy import (CheckConstraint, Column, DateTime, ForeignKey, Integer, MetaData,
                        String, Table, Text)

metadata = MetaData()


def ahora():
    return datetime.now(timezone.utc)


categoria = Table(
    "categoria", metadata,
    Column("codigo", String(20), primary_key=True),
    Column("nombre", String(60), nullable=False),
)

recurso = Table(
    "recurso", metadata,
    Column("id_recurso", String(20), primary_key=True),
    Column("titulo", String(200), nullable=False),
    Column("descripcion", Text),
    Column("categoria", String(20), ForeignKey("categoria.codigo"), nullable=False),
    Column("ubicacion", String(80), nullable=False),
    Column("existencias", Integer, nullable=False),
    Column("disponibles", Integer, nullable=False),
    Column("reservados", Integer, nullable=False, default=0),
    Column("prestados", Integer, nullable=False, default=0),
    Column("en_mantenimiento", Integer, nullable=False, default=0),
    Column("estado", String(15), nullable=False, default="ACTIVO"),
    Column("fecha_registro", DateTime(timezone=True), nullable=False, default=ahora),
    Column("fecha_actualizacion", DateTime(timezone=True), nullable=False, default=ahora, onupdate=ahora),
    CheckConstraint("disponibles >= 0 AND reservados >= 0 AND prestados >= 0 AND en_mantenimiento >= 0",
                    name="ck_recurso_no_neg"),
    CheckConstraint("disponibles + reservados + prestados + en_mantenimiento = existencias",
                    name="ck_recurso_cuadra"),
)

reserva = Table(
    "reserva", metadata,
    Column("id_prestamo", String(20), primary_key=True),
    Column("id_recurso", String(20), ForeignKey("recurso.id_recurso"), nullable=False),
    Column("estado", String(10), nullable=False, default="RESERVADA"),
    Column("fecha_creacion", DateTime(timezone=True), nullable=False, default=ahora),
    Column("fecha_actualizacion", DateTime(timezone=True), nullable=False, default=ahora, onupdate=ahora),
)
