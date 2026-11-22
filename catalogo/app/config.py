import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Config:
    db_url: str
    jwt_secret: str
    service_token: str


def cargar_config() -> Config:
    return Config(
        db_url=os.getenv("DB_URL", "postgresql+psycopg://postgres:postgres@localhost:5432/bd_catalogo"),
        jwt_secret=os.getenv("JWT_SECRET", "solo-para-desarrollo-cambiar-por-secreto-largo"),
        service_token=os.getenv("SERVICE_TOKEN", "token-interno-dev"),
    )
