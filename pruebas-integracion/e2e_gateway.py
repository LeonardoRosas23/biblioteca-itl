"""Prueba de punta a punta PI01-PI19 (sección 6.7) contra el sistema completo, a través del gateway.

Requisitos:
  1. cp .env.example .env
  2. docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d --build
  3. ./scripts/cargar-datos-demo.sh
  4. pip install httpx   (y PyJWT si se quiere probar un token expirado)

Uso (desde la raíz del repositorio):
  python pruebas-integracion/e2e_gateway.py [--url http://localhost:8080]

Las pruebas que necesitan "mover el reloj" (reserva expirada, devolución con retraso, préstamo vencido)
ajustan una fecha directamente en bd_prestamos con psql; PI18 y PI19 detienen y vuelven a arrancar
contenedores. Cada corrida registra usuarios y recursos nuevos, así que se puede repetir.
Termina con código 1 si algún caso falla y deja el reporte en docs/evidencia/e2e_gateway.txt.
"""
import argparse
import datetime as dt
import os
import shlex
import subprocess
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx

RAIZ = Path(__file__).resolve().parent.parent
# "Hoy" en la zona de la biblioteca, calculado por PostgreSQL: no depende de la zona del equipo que corre la prueba
HOY_BIBLIOTECA = "(now() AT TIME ZONE 'America/Mexico_City')::date"
PASS = "Biblio2026!"
CORRIDA = uuid.uuid4().hex[:5]
resultados = []


def caso(id_, descripcion, condicion, detalle=""):
    resultados.append((id_, descripcion, bool(condicion), str(detalle)[:90]))
    print(f"{'OK  ' if condicion else 'FALLA'} {id_:<8} {descripcion}  {'' if condicion else detalle}", flush=True)


def esperar(fn, segundos=20, cada=1.0):
    """Repite fn() hasta que devuelva algo verdadero o se acabe el tiempo; devuelve el último valor."""
    fin = time.time() + segundos
    valor = fn()
    while not valor and time.time() < fin:
        time.sleep(cada)
        valor = fn()
    return valor


class Sistema:
    def __init__(self, url, compose):
        self.url = url.rstrip("/")
        self.http = httpx.Client(base_url=self.url, timeout=20)
        self.dc = shlex.split(compose)
        self.n = 0

    # ---------- HTTP ----------
    def pedir(self, metodo, ruta, token=None, **kw):
        h = kw.pop("headers", {})
        if token:
            h["Authorization"] = f"Bearer {token}"
        return self.http.request(metodo, ruta, headers=h, **kw)

    def login(self, correo, password=PASS):
        return self.pedir("POST", "/api/v1/auth/login", json={"correo": correo, "password": password})

    def token(self, correo):
        r = self.login(correo)
        assert r.status_code == 200, f"login {correo}: {r.status_code} {r.text}"
        return r.json()["token"]

    def usuario_nuevo(self, rol="ALUMNO"):
        """Registra una cuenta nueva (como la app) y devuelve (token, idUsuario, correo)."""
        self.n += 1
        correo = f"e2e.{CORRIDA}.{self.n}@itleon.edu.mx"
        r = self.pedir("POST", "/api/v1/usuarios", json={"nombre": f"Prueba {self.n}", "correo": correo,
                                                          "password": PASS, "rol": rol})
        assert r.status_code == 201, f"registro: {r.status_code} {r.text}"
        return self.token(correo), r.json()["idUsuario"], correo

    def recurso_nuevo(self, t_biblio, existencias=1, categoria="LIBRO"):
        self.n += 1
        r = self.pedir("POST", "/api/v1/recursos", t_biblio, json={
            "titulo": f"Recurso E2E {CORRIDA}-{self.n}", "categoria": categoria,
            "ubicacion": "Mostrador", "existencias": existencias})
        assert r.status_code == 201, f"alta de recurso: {r.status_code} {r.text}"
        return r.json()["idRecurso"]

    def recurso(self, t, rid):
        return self.pedir("GET", f"/api/v1/recursos/{rid}", t).json()

    def solicitar(self, t, rid):
        return self.pedir("POST", "/api/v1/prestamos", t, json={"idRecurso": rid})

    def prestamo_activo(self, t_usuario, t_biblio, rid):
        p = self.solicitar(t_usuario, rid)
        assert p.status_code == 201, f"solicitud: {p.status_code} {p.text}"
        a = self.pedir("PATCH", f"/api/v1/prestamos/{p.json()['idPrestamo']}/aprobar", t_biblio)
        assert a.status_code == 200, f"aprobación: {a.status_code} {a.text}"
        return a.json()

    def avisos(self, t):
        r = self.pedir("GET", "/api/v1/notificaciones", t, params={"tamano": 100})
        return r.json().get("items", []) if r.status_code == 200 else []

    # ---------- infraestructura ----------
    def compose(self, *args, check=True):
        return subprocess.run(self.dc + list(args), cwd=RAIZ, capture_output=True, text=True, check=check)

    def sql_prestamos(self, sentencia):
        r = self.compose("exec", "-T", "db-prestamos", "psql", "-U", "prestamos_app", "-d", "bd_prestamos",
                         "-tAc", sentencia)
        return r.stdout.strip()

    def detener(self, servicio):
        self.compose("stop", servicio)

    def arrancar(self, servicio, ruta_salud):
        self.compose("start", servicio)
        return esperar(lambda: self.http.get(ruta_salud).status_code < 500, 120, 2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:8080")
    ap.add_argument("--compose", default="docker compose -f docker-compose.yml -f docker-compose.e2e.yml")
    a = ap.parse_args()
    s = Sistema(a.url, a.compose)

    # ================= CU08 · autenticación =================
    r = s.login("biblioteca@itleon.edu.mx")
    caso("PI01", "Login válido devuelve JWT y datos básicos",
         r.status_code == 200 and r.json()["usuario"]["rol"] == "BIBLIOTECARIO" and r.json()["token"], r.status_code)
    t_bib = r.json()["token"]
    t_admin = s.token("admin@itleon.edu.mx")
    t_ana = s.token("ana.alumna@itleon.edu.mx")
    t_beto = s.token("beto.alumno@itleon.edu.mx")

    r1 = s.login("carla.profe@itleon.edu.mx", "incorrecta")
    r2 = s.login(f"nadie.{CORRIDA}@itleon.edu.mx", "x12345678")
    caso("PI02", "Credenciales inválidas: 401 genérico, sin token",
         r1.status_code == r2.status_code == 401 and r1.json()["mensaje"] == r2.json()["mensaje"]
         and "token" not in r1.json(), (r1.status_code, r2.status_code))

    # ================= CU02 · catálogo =================
    r = s.pedir("GET", "/api/v1/recursos/R001", t_ana)
    caso("PI03", "Consulta de un recurso existente con su disponibilidad",
         r.status_code == 200 and {"disponibles", "existencias", "estado"} <= r.json().keys(), r.status_code)
    r = s.pedir("GET", "/api/v1/recursos", t_ana, params={"titulo": "cálculo", "categoria": "LIBRO"})
    vacia = s.pedir("GET", "/api/v1/recursos", t_ana, params={"titulo": f"zzz-{CORRIDA}"}).json()
    caso("PI04", "Búsqueda con filtros; sin resultados devuelve lista vacía",
         r.status_code == 200 and r.json()["items"]
         and all(i["categoria"] == "LIBRO" and "cálculo" in i["titulo"].lower() for i in r.json()["items"])
         and vacia["items"] == [] and vacia["total"] == 0, r.text[:80])

    # ================= CU03 · gestión de recursos =================
    rid = s.recurso_nuevo(t_bib, existencias=2)
    ed = s.pedir("PUT", f"/api/v1/recursos/{rid}", t_bib, json={
        "titulo": f"Recurso editado {CORRIDA}", "categoria": "LIBRO", "ubicacion": "Estante Z", "existencias": 3})
    en_uso = s.pedir("PATCH", "/api/v1/recursos/R005/estado", t_bib, json={"estado": "INACTIVO"})  # reservado en la demo
    baja = s.pedir("PATCH", f"/api/v1/recursos/{rid}/estado", t_bib, json={"estado": "INACTIVO"})
    oculto = s.pedir("GET", f"/api/v1/recursos/{rid}", t_ana)
    caso("PI05", "Alta, edición e inactivación; inactivar uno reservado da 409",
         ed.status_code == 200 and ed.json()["existencias"] == 3 and en_uso.status_code == 409
         and baja.status_code == 200 and oculto.status_code == 404,
         (ed.status_code, en_uso.status_code, baja.status_code, oculto.status_code))

    a1 = s.pedir("POST", "/api/v1/recursos", t_ana, json={"titulo": "x", "categoria": "LIBRO", "ubicacion": "x", "existencias": 1})
    a2 = s.pedir("PATCH", "/api/v1/prestamos/P-0001/aprobar", t_ana)
    caso("PI06", "Un ALUMNO no puede crear recursos ni aprobar entregas (403)",
         a1.status_code == 403 and a2.status_code == 403, (a1.status_code, a2.status_code))

    # ================= CU01 · solicitud =================
    t_u1, id_u1, _ = s.usuario_nuevo()
    rid1 = s.recurso_nuevo(t_bib, existencias=1)
    p = s.solicitar(t_u1, rid1)
    rec = s.recurso(t_u1, rid1)
    caso("PI07", "Solicitud válida: PENDIENTE_ENTREGA y el recurso baja una existencia",
         p.status_code == 201 and p.json()["estado"] == "PENDIENTE_ENTREGA" and p.json()["idUsuario"] == id_u1
         and rec["disponibles"] == 0 and rec["reservados"] == 1, (p.status_code, rec.get("disponibles")))
    p1 = p.json()

    t_u2, _, _ = s.usuario_nuevo()
    r = s.solicitar(t_u2, rid1)
    caso("PI08", "Recurso sin existencias: 409 con mensaje claro", r.status_code == 409 and r.json()["mensaje"], r.status_code)

    rid_ultima = s.recurso_nuevo(t_bib, existencias=1)
    competidores = [s.usuario_nuevo()[0] for _ in range(4)]
    with ThreadPoolExecutor(4) as pool:
        codigos = sorted(pool.map(lambda t: s.solicitar(t, rid_ultima).status_code, competidores))
    final = s.recurso(t_bib, rid_ultima)
    caso("PI09", "4 solicitudes simultáneas por la última existencia: una 201, las demás 409",
         codigos == [201, 409, 409, 409] and final["disponibles"] == 0 and final["reservados"] == 1, codigos)

    r_multa = s.solicitar(t_beto, "R007")
    t_blq, id_blq, correo_blq = s.usuario_nuevo()
    s.pedir("PATCH", f"/api/v1/usuarios/{id_blq}/estado", t_admin, json={"estado": "BLOQUEADO"})
    r_blq = s.solicitar(t_blq, "R007")            # su token sigue vigente, pero la cuenta ya no
    r_login_blq = s.login(correo_blq)
    caso("PI10", "Multa pendiente o cuenta bloqueada: 403 y no se reserva",
         r_multa.status_code == 403 and r_blq.status_code == 403 and r_blq.json()["codigo"] == "CUENTA_BLOQUEADA"
         and r_login_blq.status_code == 403,
         (r_multa.status_code, r_multa.json().get("codigo"), r_blq.status_code, r_login_blq.status_code))

    alterado = t_ana[:-4] + ("AAAA" if not t_ana.endswith("AAAA") else "BBBB")
    rs = [s.pedir("GET", "/api/v1/prestamos", alterado).status_code,
          s.pedir("GET", "/api/v1/recursos", alterado).status_code,
          s.pedir("GET", "/api/v1/notificaciones", alterado).status_code,
          s.pedir("GET", "/api/v1/usuarios/me", "no-es-un-jwt").status_code]
    secreto = os.getenv("JWT_SECRET")
    if secreto:
        import jwt
        vencido = jwt.encode({"sub": "U102", "rol": "ALUMNO", "exp": int(time.time()) - 60}, secreto, algorithm="HS256")
        rs.append(s.pedir("GET", "/api/v1/prestamos", vencido).status_code)
    caso("PI11", "Token alterado, inválido o expirado: 401 en los cuatro servicios", set(rs) == {401}, rs)

    # ================= CU04 · aprobación =================
    a = s.pedir("PATCH", f"/api/v1/prestamos/{p1['idPrestamo']}/aprobar", t_bib)
    prestado = esperar(lambda: s.recurso(t_bib, rid1)["estado"] == "PRESTADO", 15)
    t_u3, _, _ = s.usuario_nuevo()
    rid_exp = s.recurso_nuevo(t_bib)
    p_exp = s.solicitar(t_u3, rid_exp).json()
    s.sql_prestamos(f"UPDATE prestamo SET reserva_vigente_hasta = now() - interval '1 hour' "
                    f"WHERE id_prestamo = '{p_exp['idPrestamo']}'")
    a_exp = s.pedir("PATCH", f"/api/v1/prestamos/{p_exp['idPrestamo']}/aprobar", t_bib)
    liberado = esperar(lambda: s.recurso(t_bib, rid_exp)["disponibles"] == 1, 15)
    caso("PI12", "Aprobación: ACTIVO con fecha límite y recurso PRESTADO; reserva expirada 409 y se libera",
         a.status_code == 200 and a.json()["estado"] == "ACTIVO" and a.json()["fechaDevolucionEstimada"]
         and prestado and a_exp.status_code == 409 and liberado,
         (a.status_code, prestado, a_exp.status_code, liberado))

    # ================= CU05 · devolución =================
    d = s.pedir("POST", f"/api/v1/prestamos/{p1['idPrestamo']}/devolucion", t_bib, json={"danado": False})
    disponible = esperar(lambda: s.recurso(t_bib, rid1)["estado"] == "DISPONIBLE", 15)
    caso("PI13", "Devolución a tiempo: FINALIZADO sin multa y recurso DISPONIBLE",
         d.status_code == 200 and d.json()["estado"] == "FINALIZADO" and d.json()["multa"] is None and disponible,
         (d.status_code, disponible))

    t_u4, _, _ = s.usuario_nuevo()
    act = s.prestamo_activo(t_u4, t_bib, s.recurso_nuevo(t_bib))
    s.sql_prestamos(f"UPDATE prestamo SET fecha_devolucion_estimada = {HOY_BIBLIOTECA} - 3 "
                    f"WHERE id_prestamo = '{act['idPrestamo']}'")
    d = s.pedir("POST", f"/api/v1/prestamos/{act['idPrestamo']}/devolucion", t_bib).json()
    multa = d.get("multa") or {}
    caso("PI14", "Devolución 3 días tarde: multa PENDIENTE de $30.00",
         d.get("diasRetraso") == 3 and float(multa.get("montoCalculado", 0)) == 30.0
         and multa.get("estadoPago") == "PENDIENTE", d)

    # ================= CU06 · renovación =================
    t_u5, _, _ = s.usuario_nuevo()
    act = s.prestamo_activo(t_u5, t_bib, s.recurso_nuevo(t_bib))
    ren1 = s.pedir("POST", f"/api/v1/prestamos/{act['idPrestamo']}/renovacion", t_u5)
    ren2 = s.pedir("POST", f"/api/v1/prestamos/{act['idPrestamo']}/renovacion", t_u5)
    t_u6, _, _ = s.usuario_nuevo()
    t_u7, _, _ = s.usuario_nuevo()
    rid_dem = s.recurso_nuevo(t_bib)
    act_dem = s.prestamo_activo(t_u6, t_bib, rid_dem)
    s.solicitar(t_u7, rid_dem)                   # 409: queda registrada la demanda
    ren3 = s.pedir("POST", f"/api/v1/prestamos/{act_dem['idPrestamo']}/renovacion", t_u6)
    ajena = s.pedir("POST", "/api/v1/prestamos/P-0002/renovacion", t_u5)
    nueva = dt.date.fromisoformat(act["fechaDevolucionEstimada"]) + dt.timedelta(days=7)
    caso("PI15", "Renovación válida extiende 7 días; máximo, demanda y ajena se rechazan",
         ren1.status_code == 200 and ren1.json()["fechaDevolucionEstimada"] == nueva.isoformat()
         and ren2.status_code == 409 and ren2.json()["codigo"] == "LIMITE_RENOVACIONES"
         and ren3.status_code == 409 and ren3.json()["codigo"] == "RESERVA_PENDIENTE" and ajena.status_code == 403,
         (ren1.status_code, ren2.json().get("codigo"), ren3.json().get("codigo"), ajena.status_code))

    # ================= CU07 · historial =================
    propios = s.pedir("GET", "/api/v1/prestamos", t_ana).json()["items"]
    ajenos = s.pedir("GET", "/api/v1/prestamos", t_ana, params={"idUsuario": "U103"})
    multas_beto = s.pedir("GET", "/api/v1/multas", t_beto).json()["items"]
    caso("PI16", "Historial y multas propios; lo ajeno devuelve 403",
         propios and all(x["idUsuario"] == "U102" for x in propios) and ajenos.status_code == 403
         and any(m["idMulta"] == "M-0001" for m in multas_beto), (len(propios), ajenos.status_code))

    # ================= CU09 · planificador =================
    t_u8, _, _ = s.usuario_nuevo()
    act_venc = s.prestamo_activo(t_u8, t_bib, s.recurso_nuevo(t_bib))
    s.sql_prestamos(f"UPDATE prestamo SET fecha_devolucion_estimada = {HOY_BIBLIOTECA} - 1 "
                    f"WHERE id_prestamo = '{act_venc['idPrestamo']}'")
    vencido = esperar(lambda: s.pedir("GET", f"/api/v1/prestamos/{act_venc['idPrestamo']}", t_u8).json()["estado"] == "VENCIDO", 40, 2)
    recordatorio = esperar(lambda: any(n["tipo"] == "RECORDATORIO" and n["idPrestamo"] == "P-0002"
                                       for n in s.avisos(t_ana)), 40, 2)
    aviso_venc = esperar(lambda: any(n["tipo"] == "VENCIMIENTO" for n in s.avisos(t_u8)), 30, 2)
    ren_venc = s.pedir("POST", f"/api/v1/prestamos/{act_venc['idPrestamo']}/renovacion", t_u8)
    caso("PI17", "La tarea programada envía el RECORDATORIO y marca VENCIDO (con su aviso)",
         vencido and recordatorio and aviso_venc and ren_venc.status_code == 409, (vencido, recordatorio, aviso_venc))

    # ================= RNF04 · Notificaciones caído =================
    t_u9, _, _ = s.usuario_nuevo()
    s.detener("notificaciones")
    p18 = s.solicitar(t_u9, s.recurso_nuevo(t_bib))
    pendiente = s.sql_prestamos(f"SELECT estado FROM evento_pendiente WHERE clave_idempotencia = "
                                f"'CONFIRMACION:{p18.json().get('idPrestamo')}'")
    s.arrancar("notificaciones", "/api/v1/notificaciones")
    entregado = esperar(lambda: any(n["idPrestamo"] == p18.json().get("idPrestamo") for n in s.avisos(t_u9)), 150, 5)
    caso("PI18", "Con Notificaciones detenido el préstamo se crea y el aviso llega al volver",
         p18.status_code == 201 and pendiente == "PENDIENTE" and entregado, (p18.status_code, pendiente, entregado))

    # ================= PI19 · Usuarios o Catálogo caídos =================
    t_u10, id_u10, _ = s.usuario_nuevo()
    rid19 = s.recurso_nuevo(t_bib)
    s.detener("catalogo")
    r_cat = s.solicitar(t_u10, rid19)
    s.arrancar("catalogo", "/api/v1/categorias")
    s.detener("usuarios")
    r_usr = s.solicitar(t_u10, rid19)
    s.arrancar("usuarios", "/api/v1/usuarios/me")
    sin_prestamo = s.sql_prestamos(f"SELECT count(*) FROM prestamo WHERE id_usuario = '{id_u10}'") == "0"
    rec19 = s.recurso(t_bib, rid19)
    caso("PI19", "Usuarios o Catálogo caídos: 503, sin préstamo ni reserva huérfana",
         r_cat.status_code == 503 and r_usr.status_code == 503 and sin_prestamo
         and rec19["disponibles"] == 1 and rec19["reservados"] == 0,
         (r_cat.status_code, r_usr.status_code, sin_prestamo, rec19.get("reservados")))

    # ================= Seguridad del gateway, correlación y HTTPS =================
    internas = [s.pedir("POST", "/api/v1/notificaciones", headers={"X-Service-Token": "adivinado"},
                        json={"idUsuario": "U102", "tipo": "CONFIRMACION", "mensaje": "x"}).status_code,
                s.pedir("POST", "/api/v1/notificaciones/", json={}).status_code,
                s.pedir("GET", "/api/v1/reservas").status_code,
                s.pedir("POST", "/api/v1/recursos/R001/reservas", json={"idPrestamo": "P-X"}).status_code]
    caso("5.7", "Las rutas internas no son accesibles desde fuera (403)", set(internas) == {403}, internas)
    r = s.pedir("GET", "/api/v1/recursos/NO-EXISTE", t_ana, headers={"X-Correlation-Id": f"e2e-{CORRIDA}"})
    caso("D8", "El X-Correlation-Id se propaga y vuelve en el error",
         r.json().get("correlacionId") == f"e2e-{CORRIDA}" and r.headers.get("X-Correlation-Id") == f"e2e-{CORRIDA}", r.text)
    try:
        https = httpx.get(a.url.replace("http://", "https://").replace(":8080", ":8443") + "/health", verify=False, timeout=5)
        caso("RNF06", "El gateway responde por HTTPS (puerto 8443)", https.status_code == 200, https.status_code)
    except httpx.HTTPError as e:
        caso("RNF06", "El gateway responde por HTTPS (puerto 8443)", False, e)

    # ================= reporte =================
    ok = sum(1 for r in resultados if r[2])
    lineas = [f"Prueba de punta a punta por el gateway ({a.url}) · {dt.datetime.now():%d/%m/%Y %H:%M}", ""]
    lineas += [f"{'OK  ' if r[2] else 'FALLA'} {r[0]:<8} {r[1]:<95} {'' if r[2] else r[3]}" for r in resultados]
    lineas += ["", f"{ok} de {len(resultados)} casos correctos"]
    (RAIZ / "docs" / "evidencia").mkdir(parents=True, exist_ok=True)
    (RAIZ / "docs" / "evidencia" / "e2e_gateway.txt").write_text("\n".join(lineas) + "\n", encoding="utf-8")
    print(f"\n{ok} de {len(resultados)} casos correctos · reporte en docs/evidencia/e2e_gateway.txt")
    sys.exit(0 if ok == len(resultados) else 1)


if __name__ == "__main__":
    main()
