import * as SecureStore from 'expo-secure-store';
import { CLAVE } from '../src/sesion/SesionContext';

export const ANA = { idUsuario: 'U123', nombre: 'Ana Alumna', correo: 'ana.alumna@itleon.edu.mx', rol: 'ALUMNO' };

export async function guardarSesion({ usuario = ANA, expiraEnMs = Date.now() + 3_600_000 } = {}) {
  await SecureStore.setItemAsync(CLAVE, JSON.stringify({ token: 'jwt-app', usuario, expiraEnMs }));
}

const resp = (status, cuerpo) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(cuerpo) });

/** reglas: [método, regex de ruta, respuesta | (url, opciones) => respuesta] */
export function simularApi(reglas) {
  const mock = jest.fn((url, opciones = {}) => {
    const ruta = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const metodo = opciones.method || 'GET';
    for (const [m, patron, r] of reglas) {
      if (m === metodo && patron.test(ruta)) {
        const x = typeof r === 'function' ? r(url, opciones) : r;
        return resp(x.status ?? 200, x.cuerpo ?? x);
      }
    }
    return resp(404, { codigo: 'SIN_SIMULACION', mensaje: `${metodo} ${ruta}` });
  });
  global.fetch = mock;
  return mock;
}

export const pagina = (items) => ({ items, pagina: 1, tamano: 50, total: items.length });

export const RECURSOS = [
  { idRecurso: 'R001', titulo: 'Cálculo diferencial', categoria: 'LIBRO', ubicacion: 'Estante B-12', existencias: 3, disponibles: 2, estado: 'DISPONIBLE' },
  { idRecurso: 'R003', titulo: 'Proyector Epson', categoria: 'EQUIPO', ubicacion: 'Mostrador', existencias: 1, disponibles: 0, estado: 'PRESTADO' }
];

export const API_BASICA = [
  ['GET', /\/recursos$/, pagina(RECURSOS)],
  ['GET', /\/recursos\/R001$/, RECURSOS[0]],
  ['GET', /\/recursos\/R003$/, RECURSOS[1]],
  ['GET', /\/prestamos$/, pagina([])],
  ['GET', /\/notificaciones$/, pagina([])]
];
