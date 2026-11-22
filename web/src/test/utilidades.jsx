import { render } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { vi } from 'vitest';
import App from '../App';
import { CLAVE, SesionProvider } from '../sesion/SesionContext';

export const BIBLIO = { idUsuario: 'U101', nombre: 'Laura Bibliotecaria', correo: 'biblioteca@itleon.edu.mx', rol: 'BIBLIOTECARIO' };

export function guardarSesion({ usuario = BIBLIO, expiraEnMs = Date.now() + 3_600_000 } = {}) {
  sessionStorage.setItem(CLAVE, JSON.stringify({ token: 'token-de-prueba', usuario, expiraEnMs }));
}

function Ubicacion() {
  const l = useLocation();
  return <span data-testid="ruta">{l.pathname}</span>;
}

export function renderApp(ruta = '/') {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <SesionProvider>
        <App />
        <Ubicacion />
      </SesionProvider>
    </MemoryRouter>
  );
}

const json = (status, cuerpo) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(cuerpo) });

/**
 * Simula la API: recibe una lista de [método, regex de ruta, respuesta | función].
 * Devuelve el mock para inspeccionar las llamadas.
 */
export function simularApi(reglas) {
  const mock = vi.fn((url, opciones = {}) => {
    const u = new URL(url);
    const metodo = opciones.method || 'GET';
    for (const [m, patron, r] of reglas) {
      if (m === metodo && patron.test(u.pathname)) {
        const res = typeof r === 'function' ? r(u, opciones) : r;
        return json(res.status ?? 200, res.cuerpo ?? res);
      }
    }
    return json(404, { codigo: 'RUTA_NO_ENCONTRADA', mensaje: `sin simulación para ${metodo} ${u.pathname}` });
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

export const pagina = (items) => ({ items, pagina: 1, tamano: 10, total: items.length });

export const CATEGORIAS = [
  { codigo: 'EQUIPO', nombre: 'Equipo' },
  { codigo: 'LABORATORIO', nombre: 'Material de laboratorio' },
  { codigo: 'LIBRO', nombre: 'Libro' }
];

export const API_BASICA = [
  ['GET', /\/api\/v1\/categorias$/, CATEGORIAS],
  ['GET', /\/api\/v1\/recursos$/, pagina([])],
  ['GET', /\/api\/v1\/prestamos$/, pagina([])],
  ['GET', /\/api\/v1\/multas$/, pagina([])]
];
