"""Verificación local del JWT emitido por Usuarios (D2) y del token de servicio interno."""
from dataclasses import dataclass
from typing import Optional

import jwt
from fastapi import Request

from . import errores as E

STAFF = {"BIBLIOTECARIO", "ADMIN"}


@dataclass
class Sesion:
    id_usuario: Optional[str] = None
    rol: Optional[str] = None
    interno: bool = False

    @property
    def es_staff(self) -> bool:
        return self.interno or self.rol in STAFF


def leer_sesion(request: Request) -> Sesion:
    cfg = request.app.state.config
    s = Sesion()
    if request.headers.get("X-Service-Token") and request.headers["X-Service-Token"] == cfg.service_token:
        s.interno = True
    h = request.headers.get("Authorization", "")
    if h.startswith("Bearer "):
        try:
            datos = jwt.decode(h[7:], cfg.jwt_secret, algorithms=["HS256"])
        except jwt.PyJWTError:
            raise E.no_autenticado("El token es inválido o expiró.")
        s.id_usuario, s.rol = datos.get("sub"), datos.get("rol")
    return s


def autenticado(request: Request) -> Sesion:
    s = leer_sesion(request)
    if not s.interno and not s.id_usuario:
        raise E.no_autenticado()
    return s


def staff(request: Request) -> Sesion:
    s = autenticado(request)
    if not s.es_staff:
        raise E.prohibido()
    return s


def interno(request: Request) -> Sesion:
    s = leer_sesion(request)
    if not s.interno:
        raise E.prohibido("Operación reservada para servicios internos.")
    return s
