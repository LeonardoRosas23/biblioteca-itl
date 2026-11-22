"""Pruebas de los endpoints del Catálogo (contrato HTTP, seguridad y formato de errores)."""
import time

from conftest import libro, token


def crear(client, h, **kw):
    return client.post("/api/v1/recursos", json=libro(**kw), headers=h)


def test_pi03_consulta_de_recurso_existente(client, h_biblio, h_alumno):
    rid = crear(client, h_biblio).json()["idRecurso"]
    r = client.get(f"/api/v1/recursos/{rid}", headers=h_alumno)
    assert r.status_code == 200
    assert r.json()["disponibles"] == 3 and r.json()["estado"] == "DISPONIBLE"


def test_recurso_inexistente_404_con_formato_comun(client, h_alumno):
    r = client.get("/api/v1/recursos/R999", headers={**h_alumno, "X-Correlation-Id": "c0ffee"})
    assert r.status_code == 404
    assert r.json() == {"codigo": "RECURSO_NO_ENCONTRADO", "mensaje": "El recurso no existe.", "correlacionId": "c0ffee"}


def test_pi04_busqueda_con_filtros(client, h_biblio, h_alumno):
    crear(client, h_biblio)
    crear(client, h_biblio, titulo="Laptop Lenovo", categoria="EQUIPO")
    r = client.get("/api/v1/recursos", params={"titulo": "laptop", "categoria": "EQUIPO", "estado": "DISPONIBLE"},
                   headers=h_alumno)
    assert r.status_code == 200 and r.json()["total"] == 1
    vacio = client.get("/api/v1/recursos", params={"titulo": "zzz"}, headers=h_alumno).json()
    assert vacio["items"] == []


def test_pi05_alta_edicion_inactivacion(client, h_biblio, h_interno):
    rid = crear(client, h_biblio).json()["idRecurso"]
    r = client.put(f"/api/v1/recursos/{rid}", json=libro(ubicacion="Estante C-01"), headers=h_biblio)
    assert r.status_code == 200 and r.json()["ubicacion"] == "Estante C-01"
    client.post(f"/api/v1/recursos/{rid}/reservas", json={"idPrestamo": "P-1"}, headers=h_interno)
    assert client.patch(f"/api/v1/recursos/{rid}/estado", json={"estado": "INACTIVO"},
                        headers=h_biblio).status_code == 409
    client.delete(f"/api/v1/recursos/{rid}/reservas/P-1", headers=h_interno)
    r = client.patch(f"/api/v1/recursos/{rid}/estado", json={"estado": "INACTIVO"}, headers=h_biblio)
    assert r.status_code == 200 and r.json()["estado"] == "INACTIVO"


def test_pi06_alumno_no_puede_gestionar_recursos(client, h_alumno):
    r = crear(client, h_alumno)
    assert r.status_code == 403 and r.json()["codigo"] == "ACCESO_DENEGADO"


def test_campos_obligatorios_faltantes_400(client, h_biblio):
    r = client.post("/api/v1/recursos", json={"titulo": "Solo título"}, headers=h_biblio)
    assert r.status_code == 400 and "categoria" in r.json()["mensaje"]


def test_tipo_de_dato_invalido_400(client, h_biblio):
    r = client.post("/api/v1/recursos", json=libro(existencias="muchas"), headers=h_biblio)
    assert r.status_code == 400 and r.json()["codigo"] == "DATOS_INVALIDOS"


def test_pi11_sin_token_o_token_vencido_401(client):
    assert client.get("/api/v1/recursos").status_code == 401
    vencido = token(exp=int(time.time()) - 5)
    assert client.get("/api/v1/recursos", headers={"Authorization": f"Bearer {vencido}"}).status_code == 401
    assert client.get("/api/v1/recursos", headers={"Authorization": "Bearer basura"}).status_code == 401


def test_endpoints_internos_rechazan_usuarios(client, h_biblio, h_alumno):
    rid = crear(client, h_biblio).json()["idRecurso"]
    for h in (h_alumno, h_biblio, {"X-Service-Token": "falso"}):
        r = client.post(f"/api/v1/recursos/{rid}/reservas", json={"idPrestamo": "P-1"}, headers=h)
        assert r.status_code == 403


def test_pi08_reserva_sin_existencias_409(client, h_biblio, h_interno):
    rid = crear(client, h_biblio, existencias=1).json()["idRecurso"]
    ok = client.post(f"/api/v1/recursos/{rid}/reservas", json={"idPrestamo": "P-1", "cantidad": 1}, headers=h_interno)
    assert ok.status_code == 201 and ok.json()["disponibles"] == 0
    r = client.post(f"/api/v1/recursos/{rid}/reservas", json={"idPrestamo": "P-2"}, headers=h_interno)
    assert r.status_code == 409 and r.json()["codigo"] == "SIN_EXISTENCIAS"


def test_flujo_interno_entrega_y_devolucion(client, h_biblio, h_interno):
    rid = crear(client, h_biblio, existencias=1).json()["idRecurso"]
    client.post(f"/api/v1/recursos/{rid}/reservas", json={"idPrestamo": "P-1"}, headers=h_interno)
    assert client.post(f"/api/v1/recursos/{rid}/reservas/P-1/entrega", headers=h_interno).json()["estado"] == "PRESTADO"
    r = client.post(f"/api/v1/recursos/{rid}/reservas/P-1/devolucion", json={"danado": False}, headers=h_interno)
    assert r.status_code == 200 and r.json()["estado"] == "DISPONIBLE"


def test_liberar_reserva_inexistente_404(client, h_biblio, h_interno):
    rid = crear(client, h_biblio).json()["idRecurso"]
    assert client.delete(f"/api/v1/recursos/{rid}/reservas/P-9", headers=h_interno).status_code == 404


def test_categorias(client, h_alumno):
    r = client.get("/api/v1/categorias", headers=h_alumno)
    assert {c["codigo"] for c in r.json()} == {"LIBRO", "EQUIPO", "LABORATORIO"}


def test_correlacion_se_propaga(client):
    r = client.get("/health", headers={"X-Correlation-Id": "abc"})
    assert r.headers["X-Correlation-Id"] == "abc"


def test_reservas_para_conciliar_solo_internas(client, h_biblio, h_interno, h_alumno):
    rid = client.post("/api/v1/recursos", json=libro(), headers=h_biblio).json()["idRecurso"]
    client.post(f"/api/v1/recursos/{rid}/reservas", json={"idPrestamo": "P-7"}, headers=h_interno)
    assert client.get("/api/v1/reservas", headers=h_biblio).status_code == 403
    assert client.get("/api/v1/reservas", headers=h_alumno).status_code == 403
    r = client.get("/api/v1/reservas", params={"antesDe": "2999-01-01T00:00:00Z"}, headers=h_interno)
    assert r.status_code == 200 and [x["idPrestamo"] for x in r.json()] == ["P-7"]
    assert client.get("/api/v1/reservas", params={"estado": "ENTREGADA"}, headers=h_interno).status_code == 400
