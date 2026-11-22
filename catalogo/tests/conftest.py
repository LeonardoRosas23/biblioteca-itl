import os
import sys

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, insert
from sqlalchemy.pool import StaticPool

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import Config  # noqa: E402
from app.main import crear_app  # noqa: E402
from app.servicio import CatalogoServicio  # noqa: E402
from app.tablas import categoria, metadata  # noqa: E402

CFG = Config(db_url="sqlite://", jwt_secret="secreto-prueba", service_token="interno")


@pytest.fixture
def engine():
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    metadata.create_all(eng)
    with eng.begin() as c:
        c.execute(insert(categoria), [
            {"codigo": "LIBRO", "nombre": "Libro"},
            {"codigo": "EQUIPO", "nombre": "Equipo"},
            {"codigo": "LABORATORIO", "nombre": "Material de laboratorio"},
        ])
    return eng


@pytest.fixture
def svc(engine):
    return CatalogoServicio(engine)


@pytest.fixture
def client(engine):
    return TestClient(crear_app(engine, CFG))


def token(rol="ALUMNO", sub="U100", **extra):
    return jwt.encode({"sub": sub, "rol": rol, **extra}, CFG.jwt_secret, algorithm="HS256")


@pytest.fixture
def h_alumno():
    return {"Authorization": f"Bearer {token()}"}


@pytest.fixture
def h_biblio():
    return {"Authorization": f"Bearer {token('BIBLIOTECARIO', 'U101')}"}


@pytest.fixture
def h_interno():
    return {"X-Service-Token": "interno"}


def libro(**kw):
    base = {"titulo": "Cálculo diferencial", "categoria": "LIBRO", "ubicacion": "Estante B-12", "existencias": 3}
    base.update(kw)
    return base
