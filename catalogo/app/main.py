"""MS Catálogo · Python + FastAPI. Capa de presentación (rutas HTTP)."""
import uuid
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from .config import Config, cargar_config
from .errores import ApiError
from .seguridad import Sesion, autenticado, interno, staff
from .servicio import CatalogoServicio


class RecursoEntrada(BaseModel):
    titulo: Optional[str] = None
    descripcion: Optional[str] = None
    categoria: Optional[str] = None
    ubicacion: Optional[str] = None
    existencias: Optional[int] = Field(default=None)
    estado: Optional[str] = None


class EstadoEntrada(BaseModel):
    estado: str


class ReservaEntrada(BaseModel):
    idPrestamo: str
    cantidad: int = 1


class DevolucionEntrada(BaseModel):
    danado: bool = False


def crear_app(engine: Engine, config: Config) -> FastAPI:
    app = FastAPI(title="MS Catálogo", version="0.1.0", docs_url="/api/v1/catalogo/docs",
                  openapi_url="/api/v1/catalogo/openapi.json")
    app.state.config = config
    svc = CatalogoServicio(engine)

    @app.middleware("http")
    async def correlacion(request: Request, call_next):
        cid = request.headers.get("X-Correlation-Id") or uuid.uuid4().hex[:8]
        request.state.cid = cid
        resp = await call_next(request)
        resp.headers["X-Correlation-Id"] = cid
        return resp

    @app.exception_handler(ApiError)
    async def api_error(request: Request, e: ApiError):
        return JSONResponse(status_code=e.status, content={
            "codigo": e.codigo, "mensaje": e.mensaje, "correlacionId": getattr(request.state, "cid", None)},
            headers={"X-Correlation-Id": getattr(request.state, "cid", "")})

    @app.exception_handler(RequestValidationError)
    async def validacion(request: Request, e: RequestValidationError):
        campos = ", ".join(".".join(str(p) for p in err["loc"][1:]) or "cuerpo" for err in e.errors())
        return JSONResponse(status_code=400, content={
            "codigo": "DATOS_INVALIDOS", "mensaje": f"Revisa los campos: {campos}.",
            "correlacionId": getattr(request.state, "cid", None)})

    @app.get("/health")
    def health():
        return {"servicio": "catalogo", "estado": "OK"}

    # -------- CU02 · consulta --------
    @app.get("/api/v1/recursos")
    def buscar(titulo: Optional[str] = None, categoria: Optional[str] = None, estado: Optional[str] = None,
               pagina: int = Query(1, ge=1), tamano: int = Query(20, ge=1, le=100),
               s: Sesion = Depends(autenticado)):
        return svc.buscar(titulo=titulo, categoria=categoria, estado=estado,
                          pagina=pagina, tamano=tamano, es_staff=s.es_staff)

    @app.get("/api/v1/recursos/{id_recurso}")
    def detalle(id_recurso: str, s: Sesion = Depends(autenticado)):
        return svc.detalle(id_recurso, es_staff=s.es_staff)

    @app.get("/api/v1/categorias")
    def categorias(_: Sesion = Depends(autenticado)):
        return svc.categorias()

    # -------- CU03 · gestión (BIBLIOTECARIO / ADMIN) --------
    @app.post("/api/v1/recursos", status_code=201)
    def crear(d: RecursoEntrada, _: Sesion = Depends(staff)):
        return svc.crear(d.model_dump())

    @app.put("/api/v1/recursos/{id_recurso}")
    def modificar(id_recurso: str, d: RecursoEntrada, _: Sesion = Depends(staff)):
        return svc.modificar(id_recurso, d.model_dump())

    @app.patch("/api/v1/recursos/{id_recurso}/estado")
    def cambiar_estado(id_recurso: str, d: EstadoEntrada, _: Sesion = Depends(staff)):
        return svc.cambiar_estado(id_recurso, d.estado)

    @app.post("/api/v1/recursos/{id_recurso}/mantenimiento/reparar")
    def reparar(id_recurso: str, _: Sesion = Depends(staff)):
        return svc.reparar_unidad(id_recurso)

    # -------- Internas (solo red de Docker, X-Service-Token) --------
    @app.post("/api/v1/recursos/{id_recurso}/reservas", status_code=201)
    def reservar(id_recurso: str, d: ReservaEntrada, _: Sesion = Depends(interno)):
        if d.cantidad != 1:
            raise ApiError(400, "DATOS_INVALIDOS", "Por ahora solo se reserva una unidad por préstamo.")
        return svc.reservar(id_recurso, d.idPrestamo)

    @app.delete("/api/v1/recursos/{id_recurso}/reservas/{id_prestamo}", status_code=204)
    def liberar(id_recurso: str, id_prestamo: str, _: Sesion = Depends(interno)):
        svc.liberar(id_recurso, id_prestamo)
        return Response(status_code=204)

    @app.post("/api/v1/recursos/{id_recurso}/reservas/{id_prestamo}/entrega")
    def entregar(id_recurso: str, id_prestamo: str, _: Sesion = Depends(interno)):
        return svc.entregar(id_recurso, id_prestamo)

    @app.post("/api/v1/recursos/{id_recurso}/reservas/{id_prestamo}/devolucion")
    def devolver(id_recurso: str, id_prestamo: str, d: DevolucionEntrada, _: Sesion = Depends(interno)):
        return svc.devolver(id_recurso, id_prestamo, d.danado)

    @app.get("/api/v1/reservas")
    def reservas(estado: str = "RESERVADA", antesDe: Optional[datetime] = None,
                 limite: int = Query(200, ge=1, le=500), _: Sesion = Depends(interno)):
        """Interna · conciliación (D5): reservas sin recoger creadas antes de antesDe (por omisión, hace 10 min)."""
        if estado != "RESERVADA":
            raise ApiError(400, "DATOS_INVALIDOS", "Solo se concilian reservas en estado RESERVADA.")
        corte = antesDe or datetime.now(timezone.utc) - timedelta(minutes=10)
        if corte.tzinfo is None:
            corte = corte.replace(tzinfo=timezone.utc)
        return svc.reservas_sin_recoger(corte, limite)

    return app


def inicializar_postgres(engine: Engine):
    ddl = (Path(__file__).resolve().parent.parent / "db" / "schema.sql").read_text(encoding="utf-8")
    with engine.begin() as conn:
        conn.exec_driver_sql(ddl)
        conn.execute(text("""INSERT INTO categoria (codigo, nombre) VALUES
            ('LIBRO','Libro'),('EQUIPO','Equipo'),('LABORATORIO','Material de laboratorio')
            ON CONFLICT (codigo) DO NOTHING"""))


def app_produccion() -> FastAPI:
    cfg = cargar_config()
    engine = create_engine(cfg.db_url, pool_pre_ping=True, pool_size=10)
    inicializar_postgres(engine)
    return crear_app(engine, cfg)
