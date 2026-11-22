"""Pruebas unitarias de las reglas del Catálogo (capa de servicio)."""
import pytest

from app.errores import ApiError
from conftest import libro


def suma_cuadra(r):
    return r["disponibles"] + r["reservados"] + r["prestados"] + r["enMantenimiento"] == r["existencias"]


class TestGestion:
    def test_crear_asigna_id_y_disponibles(self, svc):
        r = svc.crear(libro())
        assert r["idRecurso"] == "R001"
        assert r["disponibles"] == 3 and r["estado"] == "DISPONIBLE"

    @pytest.mark.parametrize("cambio,texto", [
        ({"titulo": ""}, "titulo"),
        ({"existencias": -1}, "existencias"),
        ({"categoria": "VIDEOJUEGO"}, "categoría"),
        ({"estado": "INACTIVO"}, "estado inicial"),
    ])
    def test_crear_rechaza_datos_invalidos(self, svc, cambio, texto):
        with pytest.raises(ApiError) as e:
            svc.crear(libro(**cambio))
        assert e.value.status == 400 and texto in e.value.mensaje

    def test_modificar_ajusta_disponibles_con_el_cambio_de_existencias(self, svc):
        r = svc.crear(libro())
        r = svc.modificar(r["idRecurso"], libro(existencias=5, titulo="Cálculo 2a ed."))
        assert r["existencias"] == 5 and r["disponibles"] == 5 and r["titulo"] == "Cálculo 2a ed."

    def test_no_permite_reducir_existencias_en_uso(self, svc):
        r = svc.crear(libro(existencias=1))
        svc.reservar(r["idRecurso"], "P-1")
        with pytest.raises(ApiError) as e:
            svc.modificar(r["idRecurso"], libro(existencias=0))
        assert e.value.status == 409

    def test_inactivar_recurso_reservado_da_409(self, svc):
        r = svc.crear(libro())
        svc.reservar(r["idRecurso"], "P-1")
        with pytest.raises(ApiError) as e:
            svc.cambiar_estado(r["idRecurso"], "INACTIVO")
        assert e.value.codigo == "RECURSO_EN_USO"

    def test_inactivo_oculto_para_usuario_visible_para_staff(self, svc):
        r = svc.crear(libro())
        svc.cambiar_estado(r["idRecurso"], "INACTIVO")
        assert svc.buscar()["total"] == 0
        assert svc.buscar(es_staff=True)["total"] == 1
        with pytest.raises(ApiError):
            svc.detalle(r["idRecurso"])


class TestReservas:
    def test_reserva_descuenta_una_unidad(self, svc):
        r = svc.crear(libro(existencias=2))
        res = svc.reservar(r["idRecurso"], "P-1")
        assert res["disponibles"] == 1 and res["reservados"] == 1 and suma_cuadra(res)

    def test_reserva_es_idempotente_por_id_prestamo(self, svc):
        r = svc.crear(libro(existencias=2))
        svc.reservar(r["idRecurso"], "P-1")
        res = svc.reservar(r["idRecurso"], "P-1")
        assert res["disponibles"] == 1

    def test_sin_existencias_da_409_y_nunca_negativo(self, svc):
        r = svc.crear(libro(existencias=1))
        svc.reservar(r["idRecurso"], "P-1")
        with pytest.raises(ApiError) as e:
            svc.reservar(r["idRecurso"], "P-2")
        assert e.value.codigo == "SIN_EXISTENCIAS"
        d = svc.detalle(r["idRecurso"])
        assert d["disponibles"] == 0 and d["estado"] == "RESERVADO"

    def test_no_reserva_recurso_en_mantenimiento(self, svc):
        r = svc.crear(libro(estado="MANTENIMIENTO"))
        with pytest.raises(ApiError) as e:
            svc.reservar(r["idRecurso"], "P-1")
        assert e.value.codigo == "RECURSO_NO_DISPONIBLE"

    def test_ciclo_completo_reserva_entrega_devolucion(self, svc):
        rid = svc.crear(libro(existencias=1))["idRecurso"]
        svc.reservar(rid, "P-1")
        r = svc.entregar(rid, "P-1")
        assert r["prestados"] == 1 and r["estado"] == "PRESTADO"
        r = svc.devolver(rid, "P-1")
        assert r["disponibles"] == 1 and r["estado"] == "DISPONIBLE" and suma_cuadra(r)

    def test_devolucion_con_dano_va_a_mantenimiento_y_se_repara(self, svc):
        rid = svc.crear(libro(existencias=1))["idRecurso"]
        svc.reservar(rid, "P-1")
        svc.entregar(rid, "P-1")
        r = svc.devolver(rid, "P-1", danado=True)
        assert r["enMantenimiento"] == 1 and r["estado"] == "MANTENIMIENTO"
        r = svc.reparar_unidad(rid)
        assert r["disponibles"] == 1 and r["enMantenimiento"] == 0

    def test_liberar_reserva_devuelve_la_unidad(self, svc):
        rid = svc.crear(libro(existencias=1))["idRecurso"]
        svc.reservar(rid, "P-1")
        r = svc.liberar(rid, "P-1")
        assert r["disponibles"] == 1 and r["reservados"] == 0

    def test_operaciones_repetidas_son_idempotentes(self, svc):
        rid = svc.crear(libro(existencias=1))["idRecurso"]
        svc.reservar(rid, "P-1")
        svc.entregar(rid, "P-1")
        r = svc.entregar(rid, "P-1")
        assert r["prestados"] == 1
        svc.devolver(rid, "P-1")
        assert svc.devolver(rid, "P-1")["disponibles"] == 1

    def test_no_se_libera_una_reserva_ya_entregada(self, svc):
        rid = svc.crear(libro())["idRecurso"]
        svc.reservar(rid, "P-1")
        svc.entregar(rid, "P-1")
        with pytest.raises(ApiError) as e:
            svc.liberar(rid, "P-1")
        assert e.value.codigo == "TRANSICION_INVALIDA"

    def test_reserva_cerrada_no_se_reabre(self, svc):
        rid = svc.crear(libro())["idRecurso"]
        svc.reservar(rid, "P-1")
        svc.liberar(rid, "P-1")
        with pytest.raises(ApiError) as e:
            svc.reservar(rid, "P-1")
        assert e.value.codigo == "RESERVA_CERRADA"


class TestBusqueda:
    @pytest.fixture(autouse=True)
    def datos(self, svc):
        svc.crear(libro())
        svc.crear(libro(titulo="Laptop Lenovo", categoria="EQUIPO", ubicacion="Mostrador", existencias=1))
        svc.crear(libro(titulo="Microscopio óptico", categoria="LABORATORIO", ubicacion="Lab 2", existencias=5))
        svc.reservar("R002", "P-1")

    def test_filtra_por_titulo_sin_importar_mayusculas(self, svc):
        assert [r["idRecurso"] for r in svc.buscar(titulo="LAPTOP")["items"]] == ["R002"]

    def test_busca_por_codigo(self, svc):
        assert svc.buscar(titulo="r003")["items"][0]["titulo"] == "Microscopio óptico"

    def test_filtra_por_categoria_y_estado(self, svc):
        assert svc.buscar(categoria="equipo")["total"] == 1
        assert {r["idRecurso"] for r in svc.buscar(estado="DISPONIBLE")["items"]} == {"R001", "R003"}
        assert svc.buscar(estado="RESERVADO")["items"][0]["idRecurso"] == "R002"

    def test_sin_resultados_devuelve_lista_vacia(self, svc):
        assert svc.buscar(titulo="inexistente") == {"items": [], "pagina": 1, "tamano": 20, "total": 0}

    def test_paginacion(self, svc):
        r = svc.buscar(pagina=2, tamano=2)
        assert r["total"] == 3 and len(r["items"]) == 1

    def test_estado_de_filtro_invalido(self, svc):
        with pytest.raises(ApiError):
            svc.buscar(estado="ROTO")


class TestCorreccionesNoviembre:
    def test_busqueda_trata_comodines_como_texto(self, svc):
        svc.crear(libro(titulo="Descuento 100% garantizado"))
        svc.crear(libro(titulo="Cálculo"))
        assert [r["titulo"] for r in svc.buscar(titulo="100%")["items"]] == ["Descuento 100% garantizado"]
        assert svc.buscar(titulo="%")["total"] == 1      # solo el que contiene un % literal
        assert svc.buscar(titulo="_")["total"] == 0

    def test_recurso_sin_ejemplares_no_aparece_en_mantenimiento(self, svc):
        r = svc.crear(libro(existencias=0))
        assert r["estado"] == "SIN_EXISTENCIAS"
        assert svc.buscar(estado="SIN_EXISTENCIAS")["total"] == 1
        assert svc.buscar(estado="MANTENIMIENTO")["total"] == 0

    def test_mantenimiento_por_dano_sigue_visible(self, svc):
        rid = svc.crear(libro(existencias=1))["idRecurso"]
        svc.reservar(rid, "P-1")
        svc.entregar(rid, "P-1")
        assert svc.devolver(rid, "P-1", danado=True)["estado"] == "MANTENIMIENTO"

    def test_devolucion_repetida_no_mueve_contadores_dos_veces(self, svc):
        rid = svc.crear(libro(existencias=3))["idRecurso"]
        for p in ("P-1", "P-2"):
            svc.reservar(rid, p)
            svc.entregar(rid, p)
        svc.devolver(rid, "P-1")
        r = svc.devolver(rid, "P-1")
        assert (r["disponibles"], r["prestados"]) == (2, 1)

    def test_reservas_sin_recoger_para_conciliar(self, svc):
        from datetime import datetime, timedelta, timezone
        rid = svc.crear(libro(existencias=3))["idRecurso"]
        svc.reservar(rid, "P-1")
        svc.reservar(rid, "P-2")
        svc.entregar(rid, "P-2")
        futuro = datetime.now(timezone.utc) + timedelta(minutes=1)
        pasado = datetime.now(timezone.utc) - timedelta(hours=1)
        assert [r["idPrestamo"] for r in svc.reservas_sin_recoger(futuro)] == ["P-1"]
        assert svc.reservas_sin_recoger(pasado) == []
