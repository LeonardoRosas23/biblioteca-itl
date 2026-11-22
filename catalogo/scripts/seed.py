"""Datos de prueba del catálogo. Uso: python -m scripts.seed (con DB_URL definido)."""
from sqlalchemy import create_engine, select

from app.config import cargar_config
from app.main import inicializar_postgres
from app.servicio import CatalogoServicio
from app.tablas import recurso

RECURSOS = [
    ("Cálculo diferencial", "LIBRO", "Estante B-12", 3, "James Stewart, 8a edición."),
    ("Laptop Lenovo ThinkPad", "EQUIPO", "Mostrador", 1, "Core i5, 16 GB RAM, cargador incluido."),
    ("Proyector Epson", "EQUIPO", "Mostrador", 1, "Con cable HDMI y control remoto."),
    ("Microscopio óptico", "LABORATORIO", "Laboratorio 2", 5, "Aumento 40x-1000x."),
    ("Estructuras de datos en Java", "LIBRO", "Estante A-03", 4, "Mark Allen Weiss."),
    ("Ingeniería de software", "LIBRO", "Estante A-07", 2, "Ian Sommerville, 10a edición."),
    ("Arduino Uno kit", "LABORATORIO", "Laboratorio 1", 6, "Placa, protoboard y sensores."),
    ("Bases de datos", "LIBRO", "Estante A-05", 3, "Silberschatz, Korth y Sudarshan."),
]

if __name__ == "__main__":
    cfg = cargar_config()
    eng = create_engine(cfg.db_url)
    inicializar_postgres(eng)
    svc = CatalogoServicio(eng)
    with eng.connect() as c:
        existentes = {r[0] for r in c.execute(select(recurso.c.titulo))}
    for titulo, cat, ubic, n, desc in RECURSOS:
        if titulo in existentes:
            print(f"ya existe {titulo}")
            continue
        r = svc.crear({"titulo": titulo, "categoria": cat, "ubicacion": ubic, "existencias": n, "descripcion": desc})
        print(f"creado {r['idRecurso']} {titulo}")
