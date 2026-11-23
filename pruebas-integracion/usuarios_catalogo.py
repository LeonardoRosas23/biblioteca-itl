"""Prueba de integración real entre MS Usuarios (Node.js) y MS Catálogo (Python).

Requiere ambos servicios corriendo con el mismo JWT_SECRET y SERVICE_TOKEN y los datos semilla.
Uso:  python usuarios_catalogo.py  [URL_USUARIOS] [URL_CATALOGO] [SERVICE_TOKEN]
"""
import sys
import uuid

import httpx

U = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3001"
C = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:8000"
INTERNO = {"X-Service-Token": sys.argv[3] if len(sys.argv) > 3 else "interno-integracion"}
PASS = "Biblio2026!"
CORRIDA = uuid.uuid4().hex[:4].upper()          # folios únicos por corrida
P1, P2 = f"P-{CORRIDA}1", f"P-{CORRIDA}2"

resultados = []


def caso(id_, descripcion, condicion, detalle=""):
    resultados.append((id_, descripcion, bool(condicion), detalle))


def login(correo, password=PASS):
    return httpx.post(f"{U}/api/v1/auth/login", json={"correo": correo, "password": password})


def h(token):
    return {"Authorization": f"Bearer {token}"}


# ---------------- CU08 · autenticación ----------------
r = login("biblioteca@itleon.edu.mx")
caso("PI01", "Login válido del bibliotecario devuelve JWT", r.status_code == 200 and r.json()["usuario"]["rol"] == "BIBLIOTECARIO", r.status_code)
t_bib = r.json()["token"]
t_ana = login("ana.alumna@itleon.edu.mx").json()["token"]
t_admin = login("admin@itleon.edu.mx").json()["token"]

r1, r2 = login("ana.alumna@itleon.edu.mx", "incorrecta"), login("nadie@itleon.edu.mx", "x12345678")
caso("PI02", "Credenciales inválidas: 401 con el mismo mensaje genérico", r1.status_code == r2.status_code == 401 and r1.json()["mensaje"] == r2.json()["mensaje"], r1.json()["mensaje"])

r = httpx.post(f"{U}/api/v1/usuarios", json={"nombre": "X", "correo": f"x{uuid.uuid4().hex[:6]}@itleon.edu.mx", "password": "Segura123!", "rol": "BIBLIOTECARIO"})
caso("RN10", "El autorregistro no puede crear BIBLIOTECARIO", r.status_code == 403, r.status_code)

r = httpx.post(f"{U}/api/v1/usuarios", json={"nombre": "Externo", "correo": "alguien@gmail.com", "password": "Segura123!"})
caso("CU08-A3", "El registro exige correo institucional", r.status_code == 400, r.json().get("mensaje"))

r = httpx.post(f"{U}/api/v1/usuarios", json={"nombre": "Débil", "correo": f"d{uuid.uuid4().hex[:6]}@itleon.edu.mx", "password": "segura123"})
caso("RNF06", "El registro rechaza una contraseña débil y dice qué falta", r.status_code == 400 and "mayúscula" in r.json().get("mensaje", ""), r.json().get("mensaje"))

# ---------------- integración Node → Python: el JWT de Usuarios abre Catálogo ----------------
r = httpx.get(f"{C}/api/v1/recursos", headers=h(t_ana), params={"titulo": "cálculo"})
caso("PI03/PI04", "Catálogo (Python) acepta el JWT emitido por Usuarios (Node) y filtra", r.status_code == 200 and r.json()["total"] == 1, r.json().get("items", [{}])[0].get("titulo"))

r = httpx.get(f"{C}/api/v1/recursos", headers=h(t_ana), params={"categoria": "LABORATORIO"})
caso("PI04", "Filtro por categoría", r.status_code == 200 and {x["categoria"] for x in r.json()["items"]} == {"LABORATORIO"}, r.json()["total"])

alterado = t_ana[:-4] + ("AAAA" if not t_ana.endswith("AAAA") else "BBBB")
ru, rc = httpx.get(f"{U}/api/v1/usuarios/me", headers=h(alterado)), httpx.get(f"{C}/api/v1/recursos", headers=h(alterado))
caso("PI11", "Token alterado: 401 en ambos servicios", ru.status_code == rc.status_code == 401, f"{ru.status_code}/{rc.status_code}")

# ---------------- CU03 · gestión de recursos ----------------
r = httpx.post(f"{C}/api/v1/recursos", headers=h(t_ana), json={"titulo": "X", "categoria": "LIBRO", "ubicacion": "A", "existencias": 1})
caso("PI06", "Un ALUMNO no puede crear recursos (403)", r.status_code == 403, r.json().get("codigo"))

r = httpx.post(f"{C}/api/v1/recursos", headers=h(t_bib), json={"titulo": "Tableta Wacom", "categoria": "EQUIPO", "ubicacion": "Mostrador", "existencias": 1})
nuevo = r.json()
caso("PI05a", "Bibliotecario da de alta un recurso (201)", r.status_code == 201 and nuevo["estado"] == "DISPONIBLE", nuevo.get("idRecurso"))

r = httpx.post(f"{C}/api/v1/recursos", headers=h(t_bib), json={"titulo": "Sin datos"})
caso("CU03-A1", "Campos obligatorios faltantes (400) con explicación", r.status_code == 400, r.json()["mensaje"])

# ---------------- llamadas internas (como las hará Préstamos) ----------------
r = httpx.get(f"{U}/api/v1/usuarios/U102/estado", headers=INTERNO)
caso("CU01-4", "Usuarios responde el estado de la cuenta al servicio interno", r.status_code == 200 and r.json()["estado"] == "ACTIVO", r.json())

rid = nuevo["idRecurso"]
r1 = httpx.post(f"{C}/api/v1/recursos/{rid}/reservas", headers=INTERNO, json={"idPrestamo": P1, "cantidad": 1})
r2 = httpx.post(f"{C}/api/v1/recursos/{rid}/reservas", headers=INTERNO, json={"idPrestamo": P1, "cantidad": 1})
r3 = httpx.post(f"{C}/api/v1/recursos/{rid}/reservas", headers=INTERNO, json={"idPrestamo": P2, "cantidad": 1})
caso("D4/D7", "Reserva atómica e idempotente: repetir el mismo folio no descuenta dos veces", r1.status_code == 201 and r2.status_code == 201 and r2.json()["disponibles"] == 0, r2.json()["disponibles"])
caso("PI08", "Sin existencias: la segunda reserva distinta da 409", r3.status_code == 409 and r3.json()["codigo"] == "SIN_EXISTENCIAS", r3.json()["codigo"])

r = httpx.patch(f"{C}/api/v1/recursos/{rid}/estado", headers=h(t_bib), json={"estado": "INACTIVO"})
caso("PI05b", "No se puede inactivar un recurso reservado (409)", r.status_code == 409 and r.json()["codigo"] == "RECURSO_EN_USO", r.json()["codigo"])

httpx.post(f"{C}/api/v1/recursos/{rid}/reservas/{P1}/entrega", headers=INTERNO)
r = httpx.get(f"{C}/api/v1/recursos/{rid}", headers=h(t_ana))
caso("CU04", "Entrega: el recurso pasa a PRESTADO", r.json()["estado"] == "PRESTADO", r.json()["estado"])

r = httpx.post(f"{C}/api/v1/recursos/{rid}/reservas/{P1}/devolucion", headers=INTERNO, json={"danado": True})
caso("CU05-A3", "Devolución con daño: pasa a MANTENIMIENTO", r.json()["estado"] == "MANTENIMIENTO", r.json()["estado"])

httpx.post(f"{C}/api/v1/recursos/{rid}/mantenimiento/reparar", headers=h(t_bib))
r = httpx.patch(f"{C}/api/v1/recursos/{rid}/estado", headers=h(t_bib), json={"estado": "INACTIVO"})
ra = httpx.get(f"{C}/api/v1/recursos/{rid}", headers=h(t_ana))
caso("PI05c", "Reparado e inactivado: el alumno ya no lo ve (404)", r.status_code == 200 and ra.status_code == 404, ra.status_code)

r = httpx.post(f"{C}/api/v1/recursos/R001/reservas", headers=h(t_bib), json={"idPrestamo": "P-1"})
caso("5.7", "Las rutas internas rechazan a usuarios aunque sean personal (403)", r.status_code == 403, r.status_code)

# ---------------- bloqueo de cuentas ----------------
r = httpx.patch(f"{U}/api/v1/usuarios/U103/estado", headers=h(t_admin), json={"estado": "BLOQUEADO"})
rl = login("beto.alumno@itleon.edu.mx")
re_ = httpx.get(f"{U}/api/v1/usuarios/U103/estado", headers=INTERNO)
httpx.patch(f"{U}/api/v1/usuarios/U103/estado", headers=h(t_admin), json={"estado": "ACTIVO"})
caso("PI10", "Cuenta bloqueada: login 403 y Préstamos la vería BLOQUEADA", r.status_code == 200 and rl.status_code == 403 and re_.json()["estado"] == "BLOQUEADO", rl.json().get("codigo"))

# ---------------- trazabilidad ----------------
r = httpx.get(f"{C}/api/v1/recursos/R999", headers={**h(t_ana), "X-Correlation-Id": "e2e-7c1e"})
caso("D8", "El X-Correlation-Id se devuelve en el cuerpo y el encabezado del error", r.json()["correlacionId"] == "e2e-7c1e" == r.headers["X-Correlation-Id"], r.json())

# ---------------- reporte ----------------
ancho = max(len(d) for _, d, _, _ in resultados)
for id_, desc, ok, det in resultados:
    print(f"{'OK  ' if ok else 'FALLA'} {id_:<10} {desc:<{ancho}}  {det}")
fallas = sum(1 for r in resultados if not r[2])
print(f"\n{len(resultados) - fallas} de {len(resultados)} casos correctos")
sys.exit(1 if fallas else 0)
