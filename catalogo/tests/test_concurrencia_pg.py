"""PI09 · Solicitudes simultáneas contra PostgreSQL real.
Se ejecuta solo si existe la variable TEST_PG_URL (por ejemplo
postgresql+psycopg://postgres:postgres@localhost:5432/bd_catalogo_test)."""
import os
from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy import create_engine, text

from app.errores import ApiError
from app.main import inicializar_postgres
from app.servicio import CatalogoServicio

URL = os.getenv("TEST_PG_URL")
pytestmark = pytest.mark.skipif(not URL, reason="Define TEST_PG_URL para correr contra PostgreSQL")


@pytest.fixture
def svc_pg():
    eng = create_engine(URL, pool_size=25, max_overflow=0)
    with eng.begin() as c:
        c.execute(text("DROP TABLE IF EXISTS reserva, recurso, categoria CASCADE"))
        c.execute(text("DROP SEQUENCE IF EXISTS recurso_seq"))
    inicializar_postgres(eng)
    yield CatalogoServicio(eng)
    eng.dispose()


@pytest.mark.parametrize("existencias,solicitudes", [(1, 2), (1, 20), (5, 40)])
def test_pi09_solicitudes_simultaneas_no_sobreasignan(svc_pg, existencias, solicitudes):
    rid = svc_pg.crear({"titulo": "Laptop", "categoria": "EQUIPO", "ubicacion": "Mostrador",
                        "existencias": existencias})["idRecurso"]

    def intento(i):
        try:
            svc_pg.reservar(rid, f"P-{i}")
            return 201
        except ApiError as e:
            return e.status

    with ThreadPoolExecutor(max_workers=solicitudes) as pool:
        resultados = list(pool.map(intento, range(solicitudes)))

    assert resultados.count(201) == existencias
    assert resultados.count(409) == solicitudes - existencias
    final = svc_pg.detalle(rid)
    assert final["disponibles"] == 0 and final["reservados"] == existencias


@pytest.mark.parametrize("transicion", ["entregar", "devolver", "liberar"])
def test_transicion_simultanea_del_mismo_prestamo_mueve_una_sola_unidad(svc_pg, transicion):
    """Dos llamadas a la vez con el mismo idPrestamo (despacho inmediato + bandeja de salida)
    no deben mover los contadores dos veces. Hay otro préstamo (P-2) para detectar el descuadre."""
    import threading

    rid = svc_pg.crear({"titulo": "Calculadora", "categoria": "EQUIPO", "ubicacion": "M",
                        "existencias": 3})["idRecurso"]
    for p in ("P-1", "P-2"):
        svc_pg.reservar(rid, p)
        if transicion == "devolver" or p == "P-2":
            svc_pg.entregar(rid, p)
    antes = svc_pg.detalle(rid)

    # Ambos hilos llegan juntos al punto de lectura de la reserva
    barrera = threading.Barrier(2)
    original = svc_pg.repo.obtener_reserva

    def con_barrera(conn, idp, bloquear=False):
        try:
            barrera.wait(timeout=2)
        except threading.BrokenBarrierError:
            pass
        return original(conn, idp, bloquear)

    svc_pg.repo.obtener_reserva = con_barrera
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda _: getattr(svc_pg, transicion)(rid, "P-1"), range(2)))
    svc_pg.repo.obtener_reserva = original

    despues = svc_pg.detalle(rid)
    movidas = sum(abs(despues[k] - antes[k]) for k in ("disponibles", "reservados", "prestados", "enMantenimiento"))
    assert movidas == 2, f"{transicion}: antes {antes}, después {despues}"
