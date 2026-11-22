"""RNF05 · Prueba de carga de GET /api/v1/recursos con percentil 95.

Uso (con el Catálogo corriendo y JWT_SECRET igual al del servicio):
    JWT_SECRET=... python -m scripts.prueba_carga --url http://localhost:8080 --peticiones 2000 --concurrencia 20

Por defecto apunta al gateway. Genera su propio JWT de ALUMNO para no depender de Usuarios.
Mezcla búsquedas sin filtro, por título, por categoría y por estado, como en la app.
Sale con código 1 si el p95 supera el objetivo (300 ms por defecto).
"""
import argparse
import asyncio
import os
import random
import statistics
import time

import httpx
import jwt

CONSULTAS = [
    {},
    {"titulo": "cálculo"},
    {"titulo": "datos"},
    {"categoria": "LIBRO"},
    {"categoria": "EQUIPO", "estado": "DISPONIBLE"},
    {"estado": "DISPONIBLE", "pagina": 2},
]


def token(secreto: str) -> str:
    ahora = int(time.time())
    return jwt.encode({"sub": "U-CARGA", "rol": "ALUMNO", "iat": ahora, "exp": ahora + 3600}, secreto, algorithm="HS256")


def percentil(valores, p):
    ordenados = sorted(valores)
    k = max(0, min(len(ordenados) - 1, round(p / 100 * len(ordenados)) - 1))
    return ordenados[k]


async def correr(url, total, concurrencia, cabeceras):
    tiempos, errores = [], 0
    cola = asyncio.Queue()
    for _ in range(total):
        cola.put_nowait(random.choice(CONSULTAS))

    async with httpx.AsyncClient(base_url=url, headers=cabeceras, timeout=10) as cliente:
        # Calentamiento: conexiones abiertas y planes de consulta en caché
        for q in CONSULTAS:
            await cliente.get("/api/v1/recursos", params=q)

        async def trabajador():
            nonlocal errores
            while not cola.empty():
                params = cola.get_nowait()
                t0 = time.perf_counter()
                try:
                    r = await cliente.get("/api/v1/recursos", params=params)
                    if r.status_code != 200:
                        errores += 1
                except httpx.HTTPError:
                    errores += 1
                tiempos.append((time.perf_counter() - t0) * 1000)

        inicio = time.perf_counter()
        await asyncio.gather(*(trabajador() for _ in range(concurrencia)))
        duracion = time.perf_counter() - inicio
    return tiempos, errores, duracion


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", default="http://localhost:8080")
    ap.add_argument("--peticiones", type=int, default=2000)
    ap.add_argument("--concurrencia", type=int, default=20)
    ap.add_argument("--objetivo-ms", type=float, default=300)
    a = ap.parse_args()

    secreto = os.environ.get("JWT_SECRET", "solo-para-desarrollo-cambiar-por-secreto-largo")
    tiempos, errores, duracion = asyncio.run(
        correr(a.url, a.peticiones, a.concurrencia, {"Authorization": f"Bearer {token(secreto)}"}))

    p95 = percentil(tiempos, 95)
    print(f"RNF05 · GET /api/v1/recursos · {a.url}")
    print(f"  peticiones      {len(tiempos)}  (concurrencia {a.concurrencia}, errores {errores})")
    print(f"  rendimiento     {len(tiempos) / duracion:.0f} peticiones/s")
    print(f"  p50 / p95 / p99 {statistics.median(tiempos):.1f} / {p95:.1f} / {percentil(tiempos, 99):.1f} ms")
    print(f"  máximo          {max(tiempos):.1f} ms")
    ok = p95 < a.objetivo_ms and errores == 0
    print(f"  resultado       {'CUMPLE' if ok else 'NO CUMPLE'} (objetivo p95 < {a.objetivo_ms:.0f} ms)")
    raise SystemExit(0 if ok else 1)


if __name__ == "__main__":
    main()
