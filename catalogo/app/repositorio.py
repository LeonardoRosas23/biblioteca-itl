"""Capa de acceso a datos del Catálogo. Todas las operaciones de existencias son
UPDATE condicionales, por lo que dos solicitudes simultáneas nunca dejan contadores negativos (D4)."""
from sqlalchemy import and_, func, insert, or_, select, text, update
from sqlalchemy.engine import Connection, Engine

from .tablas import ahora, categoria, recurso, reserva


def patron_like(texto: str) -> str:
    """Patrón LIKE que busca el texto literal: % y _ escritos por el usuario no actúan como comodines."""
    limpio = texto.lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{limpio}%"


def estado_visible():
    """Estado que ve el usuario, derivado del estado administrativo y de los contadores."""
    from sqlalchemy import case
    r = recurso.c
    return case(
        (r.estado == "INACTIVO", "INACTIVO"),
        (r.estado == "MANTENIMIENTO", "MANTENIMIENTO"),
        (r.disponibles > 0, "DISPONIBLE"),
        (r.prestados > 0, "PRESTADO"),
        (r.reservados > 0, "RESERVADO"),
        (r.en_mantenimiento > 0, "MANTENIMIENTO"),
        else_="SIN_EXISTENCIAS",   # existencias = 0: no está en mantenimiento, simplemente no hay ejemplares
    ).label("estado_visible")


class CatalogoRepositorio:
    def __init__(self, engine: Engine):
        self.engine = engine
        self.es_postgres = engine.dialect.name == "postgresql"

    # ---------- consultas ----------
    def listar(self, conn: Connection, *, titulo=None, categoria_=None, estado=None,
               incluir_inactivos=False, pagina=1, tamano=20):
        ev = estado_visible()
        filtros = []
        if titulo:
            filtros.append(or_(func.lower(recurso.c.titulo).like(patron_like(titulo), escape="\\"),
                               func.lower(recurso.c.id_recurso) == titulo.lower()))
        if categoria_:
            filtros.append(recurso.c.categoria == categoria_.upper())
        if estado:
            filtros.append(ev == estado.upper())
        if not incluir_inactivos:
            filtros.append(recurso.c.estado != "INACTIVO")
        cond = and_(*filtros) if filtros else text("1=1")
        total = conn.execute(select(func.count()).select_from(recurso).where(cond)).scalar_one()
        filas = conn.execute(
            select(recurso, ev).where(cond).order_by(recurso.c.id_recurso)
            .limit(tamano).offset((pagina - 1) * tamano)
        ).mappings().all()
        return filas, total

    def obtener(self, conn: Connection, id_recurso: str, bloquear=False):
        q = select(recurso, estado_visible()).where(recurso.c.id_recurso == id_recurso)
        if bloquear and self.es_postgres:
            q = q.with_for_update()
        return conn.execute(q).mappings().first()

    def categorias(self, conn):
        return conn.execute(select(categoria).order_by(categoria.c.nombre)).mappings().all()

    def existe_categoria(self, conn, codigo):
        return conn.execute(select(categoria.c.codigo).where(categoria.c.codigo == codigo)).first() is not None

    # ---------- escritura ----------
    def siguiente_id(self, conn: Connection) -> str:
        if self.es_postgres:
            n = conn.execute(text("SELECT nextval('recurso_seq')")).scalar_one()
        else:
            n = conn.execute(select(func.count()).select_from(recurso)).scalar_one() + 1
        return f"R{n:03d}"

    def insertar(self, conn, datos: dict):
        conn.execute(insert(recurso).values(**datos))

    def actualizar(self, conn, id_recurso, **valores):
        valores["fecha_actualizacion"] = ahora()
        conn.execute(update(recurso).where(recurso.c.id_recurso == id_recurso).values(**valores))

    def mover_unidad(self, conn, id_recurso, desde: str, hacia: str, condicion_extra=None) -> bool:
        """Pasa una unidad de un contador a otro solo si hay al menos una en el origen.
        Devuelve False si no se pudo (sin existencias)."""
        c = recurso.c
        cond = and_(c.id_recurso == id_recurso, getattr(c, desde) > 0)
        if condicion_extra is not None:
            cond = and_(cond, condicion_extra)
        res = conn.execute(
            update(recurso).where(cond).values(
                **{desde: getattr(c, desde) - 1, hacia: getattr(c, hacia) + 1, "fecha_actualizacion": ahora()}
            )
        )
        return res.rowcount == 1

    # ---------- reservas ----------
    def obtener_reserva(self, conn, id_prestamo, bloquear=False):
        q = select(reserva).where(reserva.c.id_prestamo == id_prestamo)
        if bloquear and self.es_postgres:
            q = q.with_for_update()
        return conn.execute(q).mappings().first()

    def reservas_en_estado(self, conn, estado: str, antes_de, limite: int):
        """Reservas en un estado creadas antes de una fecha (conciliación D5)."""
        return conn.execute(
            select(reserva).where(and_(reserva.c.estado == estado, reserva.c.fecha_creacion < antes_de))
            .order_by(reserva.c.fecha_creacion).limit(limite)
        ).mappings().all()

    def insertar_reserva(self, conn, id_prestamo, id_recurso):
        conn.execute(insert(reserva).values(id_prestamo=id_prestamo, id_recurso=id_recurso, estado="RESERVADA"))

    def cambiar_reserva(self, conn, id_prestamo, desde: str, hacia: str) -> bool:
        res = conn.execute(
            update(reserva)
            .where(and_(reserva.c.id_prestamo == id_prestamo, reserva.c.estado == desde))
            .values(estado=hacia, fecha_actualizacion=ahora())
        )
        return res.rowcount == 1

    def reservas_por_recurso(self, conn, id_recurso):
        return conn.execute(
            select(reserva.c.estado, func.count()).where(reserva.c.id_recurso == id_recurso)
            .group_by(reserva.c.estado)
        ).all()
