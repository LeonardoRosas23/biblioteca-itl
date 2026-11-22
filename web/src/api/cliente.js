// Cliente HTTP común: agrega el JWT, el X-Correlation-Id (D8) y traduce el formato de error común.

export class ApiError extends Error {
  constructor(status, codigo, mensaje, correlacionId) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
    this.correlacionId = correlacionId;
  }
}

let obtenerToken = () => null;
let alNoAutorizado = () => {};

/** Lo llama el contexto de sesión para conectar el cliente con el token y el cierre automático. */
export function configurarCliente({ token, noAutorizado }) {
  obtenerToken = token;
  alNoAutorizado = noAutorizado;
}

const BASE = import.meta.env?.VITE_API_URL || '';

function idCorrelacion() {
  return Math.random().toString(16).slice(2, 10);
}

export async function pedir(ruta, { metodo = 'GET', cuerpo, params } = {}) {
  const url = new URL(BASE + ruta, window.location.origin);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });
  const cabeceras = { 'X-Correlation-Id': idCorrelacion() };
  const token = obtenerToken();
  if (token) cabeceras.Authorization = `Bearer ${token}`;
  if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(url.toString(), {
      method: metodo,
      headers: cabeceras,
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined
    });
  } catch {
    throw new ApiError(0, 'SIN_CONEXION', 'No hay conexión con el servidor. Revisa tu red e inténtalo de nuevo.');
  }

  if (res.status === 204) return null;
  const datos = await res.json().catch(() => null);
  if (res.ok) return datos;

  const err = new ApiError(
    res.status,
    datos?.codigo || 'ERROR',
    datos?.mensaje || `El servidor respondió ${res.status}.`,
    datos?.correlacionId
  );
  // Un 401 con sesión abierta significa token vencido o inválido: se cierra la sesión.
  if (res.status === 401 && token) alNoAutorizado();
  throw err;
}
