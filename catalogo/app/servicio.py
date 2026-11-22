"""Reglas de negocio del Catálogo (CU02, CU03 y operaciones internas de reserva)."""
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError

from . import errores as E
from .repositorio import CatalogoRepositorio
from .tablas import recurso

class _ReservaCambio(Exception):
    """La reserva cambió entre la lectura y la escritura; la transacción se revierte y se reintenta."""


ESTADOS_ADMIN = {"DISPONIBLE": "ACTIVO", "ACTIVO": "ACTIVO", "MANTENIMIENTO": "MANTENIMIENTO", "INACTIVO": "INACTIVO"}
ESTADOS_FILTRO = {"DISPONIBLE", "RESERVADO", "PRESTADO", "MANTENIMIENTO", "SIN_EXISTENCIAS", "INACTIVO"}


def a_json(fila) -> dict:
    return {
        "idRecurso": fila["id_recurso"],
        "titulo": fila["titulo"],
        "descripcion": fila["descripcion"],
        "categoria": fila["categoria"],
        "ubicacion": fila["ubicacion"],
        "existencias": fila["existencias"],
        "disponibles": fila["disponibles"],
        "reservados": fila["reservados"],
        "prestados": fila["prestados"],
        "enMantenimiento": fila["en_mantenimiento"],
        "estado": fila["estado_visible"],
    }


class CatalogoServicio:
    def __init__(self, engine: Engine):
        self.engine = engine
        self.repo = CatalogoRepositorio(engine)

    # ---------------- consultas (CU02) ----------------
    def buscar(self, *, titulo=None, categoria=None, estado=None, pagina=1, tamano=20, es_staff=False):
        if estado and estado.upper() not in ESTADOS_FILTRO:
            raise E.invalido(f"Estado no válido. Usa uno de: {', '.join(sorted(ESTADOS_FILTRO))}.")
        if estado and estado.upper() == "INACTIVO" and not es_staff:
            raise E.prohibido("Solo el personal puede consultar recursos inactivos.")
        pagina = max(1, pagina)
        tamano = min(100, max(1, tamano))
        with self.engine.connect() as conn:
            filas, total = self.repo.listar(
                conn, titulo=titulo, categoria_=categoria, estado=estado,
                incluir_inactivos=es_staff, pagina=pagina, tamano=tamano)
        return {"items": [a_json(f) for f in filas], "pagina": pagina, "tamano": tamano, "total": total}

    def detalle(self, id_recurso: str, es_staff=False) -> dict:
        with self.engine.connect() as conn:
            fila = self.repo.obtener(conn, id_recurso)
        if not fila or (fila["estado"] == "INACTIVO" and not es_staff):
            raise E.no_encontrado()
        return a_json(fila)

    def categorias(self):
        with self.engine.connect() as conn:
            return [dict(c) for c in self.repo.categorias(conn)]

    # ---------------- gestión (CU03) ----------------
    def _validar(self, conn, d: dict, parcial=False):
        req = ["titulo", "categoria", "ubicacion", "existencias"]
        faltan = [k for k in req if not parcial and (d.get(k) is None or str(d.get(k)).strip() == "")]
        if faltan:
            raise E.invalido(f"Faltan campos obligatorios: {', '.join(faltan)}.")
        if "existencias" in d and d["existencias"] is not None:
            if not isinstance(d["existencias"], int) or d["existencias"] < 0 or d["existencias"] > 9999:
                raise E.invalido("existencias debe ser un entero entre 0 y 9999.")
        if d.get("titulo") is not None and len(d["titulo"].strip()) > 200:
            raise E.invalido("El título admite como máximo 200 caracteres.")
        if d.get("categoria") is not None and not self.repo.existe_categoria(conn, d["categoria"].upper()):
            raise E.invalido("La categoría no existe.")

    def crear(self, d: dict) -> dict:
        estado = ESTADOS_ADMIN.get((d.get("estado") or "DISPONIBLE").upper())
        if estado is None or estado == "INACTIVO":
            raise E.invalido("El estado inicial debe ser DISPONIBLE o MANTENIMIENTO.")
        with self.engine.begin() as conn:
            self._validar(conn, d)
            id_recurso = self.repo.siguiente_id(conn)
            n = d["existencias"]
            self.repo.insertar(conn, {
                "id_recurso": id_recurso,
                "titulo": d["titulo"].strip(),
                "descripcion": (d.get("descripcion") or "").strip() or None,
                "categoria": d["categoria"].upper(),
                "ubicacion": d["ubicacion"].strip(),
                "existencias": n, "disponibles": n, "reservados": 0, "prestados": 0, "en_mantenimiento": 0,
                "estado": estado,
            })
            return a_json(self.repo.obtener(conn, id_recurso))

    def modificar(self, id_recurso: str, d: dict) -> dict:
        with self.engine.begin() as conn:
            actual = self.repo.obtener(conn, id_recurso, bloquear=True)
            if not actual:
                raise E.no_encontrado()
            self._validar(conn, d)
            delta = d["existencias"] - actual["existencias"]
            if actual["disponibles"] + delta < 0:
                en_uso = actual["reservados"] + actual["prestados"] + actual["en_mantenimiento"]
                raise E.conflicto("EXISTENCIAS_EN_USO",
                                  f"No puedes dejar menos de {en_uso} existencias: están reservadas, prestadas o en mantenimiento.")
            self.repo.actualizar(conn, id_recurso,
                                 titulo=d["titulo"].strip(),
                                 descripcion=(d.get("descripcion") or "").strip() or None,
                                 categoria=d["categoria"].upper(),
                                 ubicacion=d["ubicacion"].strip(),
                                 existencias=d["existencias"],
                                 disponibles=actual["disponibles"] + delta)
            return a_json(self.repo.obtener(conn, id_recurso))

    def cambiar_estado(self, id_recurso: str, estado: str) -> dict:
        nuevo = ESTADOS_ADMIN.get((estado or "").upper())
        if nuevo is None:
            raise E.invalido("Estado no válido. Usa DISPONIBLE, MANTENIMIENTO o INACTIVO.")
        with self.engine.begin() as conn:
            actual = self.repo.obtener(conn, id_recurso, bloquear=True)
            if not actual:
                raise E.no_encontrado()
            # CU03-A3: no se puede inactivar ni mandar a mantenimiento lo que está reservado o prestado
            if nuevo != "ACTIVO" and (actual["reservados"] or actual["prestados"]):
                raise E.conflicto("RECURSO_EN_USO",
                                  "El recurso tiene ejemplares reservados o prestados; espera a que se devuelvan.")
            self.repo.actualizar(conn, id_recurso, estado=nuevo)
            return a_json(self.repo.obtener(conn, id_recurso))

    def reparar_unidad(self, id_recurso: str) -> dict:
        with self.engine.begin() as conn:
            if not self.repo.obtener(conn, id_recurso):
                raise E.no_encontrado()
            if not self.repo.mover_unidad(conn, id_recurso, "en_mantenimiento", "disponibles"):
                raise E.conflicto("SIN_UNIDADES_EN_MANTENIMIENTO", "No hay ejemplares en mantenimiento.")
            return a_json(self.repo.obtener(conn, id_recurso))

    # ---------------- operaciones internas (Préstamos → Catálogo) ----------------
    def reservar(self, id_recurso: str, id_prestamo: str) -> dict:
        """Reserva atómica e idempotente (D4, D7): repetir con el mismo idPrestamo no descuenta dos veces."""
        if not id_prestamo:
            raise E.invalido("idPrestamo es obligatorio.")
        try:
            with self.engine.begin() as conn:
                previa = self.repo.obtener_reserva(conn, id_prestamo)
                if previa:
                    if previa["id_recurso"] != id_recurso:
                        raise E.conflicto("RESERVA_DE_OTRO_RECURSO", "Ese idPrestamo ya reservó otro recurso.")
                    if previa["estado"] in ("RESERVADA", "ENTREGADA"):
                        return {**a_json(self.repo.obtener(conn, id_recurso)), "reserva": previa["estado"]}
                    raise E.conflicto("RESERVA_CERRADA", f"La reserva ya está {previa['estado']}.")
                fila = self.repo.obtener(conn, id_recurso)
                if not fila:
                    raise E.no_encontrado()
                if fila["estado"] != "ACTIVO":
                    raise E.conflicto("RECURSO_NO_DISPONIBLE", "El recurso no se puede prestar en este momento.")
                ok = self.repo.mover_unidad(conn, id_recurso, "disponibles", "reservados",
                                            recurso.c.estado == "ACTIVO")
                if not ok:
                    raise E.conflicto("SIN_EXISTENCIAS", "El recurso ya no tiene existencias disponibles.")
                self.repo.insertar_reserva(conn, id_prestamo, id_recurso)
                return {**a_json(self.repo.obtener(conn, id_recurso)), "reserva": "RESERVADA"}
        except IntegrityError:
            # Dos llamadas simultáneas con el mismo idPrestamo: la segunda pierde la carrera.
            return self.reservar(id_recurso, id_prestamo)

    def _transicion(self, id_recurso, id_prestamo, desde_res, hacia_res, desde_cnt, hacia_cnt, nombre):
        try:
            return self._transicion_una_vez(id_recurso, id_prestamo, desde_res, hacia_res, desde_cnt, hacia_cnt, nombre)
        except _ReservaCambio:
            # Se vuelve a leer: ahora la reserva ya está en su nuevo estado y la llamada es idempotente.
            return self._transicion_una_vez(id_recurso, id_prestamo, desde_res, hacia_res, desde_cnt, hacia_cnt, nombre)

    def _transicion_una_vez(self, id_recurso, id_prestamo, desde_res, hacia_res, desde_cnt, hacia_cnt, nombre):
        with self.engine.begin() as conn:
            # FOR UPDATE: si dos llamadas con el mismo préstamo llegan a la vez, la segunda espera
            # a que la primera termine y entonces ve el estado ya cambiado.
            r = self.repo.obtener_reserva(conn, id_prestamo, bloquear=True)
            if not r or r["id_recurso"] != id_recurso:
                raise E.ApiError(404, "RESERVA_NO_ENCONTRADA", "No existe una reserva para ese préstamo.")
            if r["estado"] == hacia_res:  # idempotente
                return a_json(self.repo.obtener(conn, id_recurso))
            if r["estado"] != desde_res:
                raise E.conflicto("TRANSICION_INVALIDA", f"No se puede {nombre} una reserva {r['estado']}.")
            if not self.repo.cambiar_reserva(conn, id_prestamo, desde_res, hacia_res):
                # Otra transacción cambió la reserva entre la lectura y la escritura: los contadores
                # solo se mueven si esta llamada fue la que hizo la transición.
                raise _ReservaCambio()
            if not self.repo.mover_unidad(conn, id_recurso, desde_cnt, hacia_cnt):
                raise E.conflicto("CONTADORES_INCONSISTENTES", "Los contadores del recurso no cuadran.")
            return a_json(self.repo.obtener(conn, id_recurso))

    def reservas_sin_recoger(self, antes_de, limite=200) -> list:
        """D5 · conciliación: reservas RESERVADAS más antiguas que la fecha indicada.
        Préstamos las compara con sus préstamos y libera las que no tienen uno vigente."""
        limite = min(500, max(1, limite))
        with self.engine.connect() as conn:
            filas = self.repo.reservas_en_estado(conn, "RESERVADA", antes_de, limite)
        return [{"idPrestamo": f["id_prestamo"], "idRecurso": f["id_recurso"],
                 "fechaCreacion": f["fecha_creacion"].isoformat()} for f in filas]

    def liberar(self, id_recurso, id_prestamo):
        """Compensación o reserva expirada: la unidad regresa a disponibles."""
        return self._transicion(id_recurso, id_prestamo, "RESERVADA", "LIBERADA",
                                "reservados", "disponibles", "liberar")

    def entregar(self, id_recurso, id_prestamo):
        """CU04: la unidad reservada pasa a prestada."""
        return self._transicion(id_recurso, id_prestamo, "RESERVADA", "ENTREGADA",
                                "reservados", "prestados", "entregar")

    def devolver(self, id_recurso, id_prestamo, danado=False):
        """CU05: la unidad regresa a disponibles, o a mantenimiento si se reportó daño."""
        return self._transicion(id_recurso, id_prestamo, "ENTREGADA", "DEVUELTA",
                                "prestados", "en_mantenimiento" if danado else "disponibles", "devolver")
