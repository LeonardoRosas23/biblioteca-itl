// Cliente HTTP de la app: mismo contrato que el panel (JWT, X-Correlation-Id, formato de error común).

export class ApiError extends Error {
  constructor(status, codigo, mensaje) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
  }
}

// En un emulador Android, "localhost" del equipo es 10.0.2.2; se configura con EXPO_PUBLIC_API_URL.
export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8080';

let obtenerToken = () => null;
let alNoAutorizado = () => {};

export function configurarCliente({ token, noAutorizado }) {
  obtenerToken = token;
  alNoAutorizado = noAutorizado;
}

export async function pedir(ruta, { metodo = 'GET', cuerpo, params } = {}) {
  const qs = Object.entries(params || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const cabeceras = { 'X-Correlation-Id': Math.random().toString(16).slice(2, 10) };
  const token = obtenerToken();
  if (token) cabeceras.Authorization = `Bearer ${token}`;
  if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${API_URL}${ruta}${qs ? `?${qs}` : ''}`, {
      method: metodo,
      headers: cabeceras,
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined
    });
  } catch {
    throw new ApiError(0, 'SIN_CONEXION', 'No hay conexión con la biblioteca. Revisa tu internet e inténtalo de nuevo.');
  }
  if (res.status === 204) return null;
  const datos = await res.json().catch(() => null);
  if (res.ok) return datos;
  if (res.status === 401 && token) alNoAutorizado();
  throw new ApiError(res.status, datos?.codigo || 'ERROR', datos?.mensaje || `Error ${res.status}`);
}

export const api = {
  login: (correo, password) => pedir('/api/v1/auth/login', { metodo: 'POST', cuerpo: { correo, password } }),
  registrar: (datos) => pedir('/api/v1/usuarios', { metodo: 'POST', cuerpo: datos }),
  recursos: (params) => pedir('/api/v1/recursos', { params }),
  recurso: (id) => pedir(`/api/v1/recursos/${encodeURIComponent(id)}`),
  solicitar: (idRecurso) => pedir('/api/v1/prestamos', { metodo: 'POST', cuerpo: { idRecurso } }),
  misPrestamos: (params) => pedir('/api/v1/prestamos', { params: { tamano: 50, ...params } }),
  renovar: (id) => pedir(`/api/v1/prestamos/${encodeURIComponent(id)}/renovacion`, { metodo: 'POST' }),
  avisos: () => pedir('/api/v1/notificaciones', { params: { tamano: 50 } }),
  marcarLeido: (id) => pedir(`/api/v1/notificaciones/${encodeURIComponent(id)}/leida`, { metodo: 'PATCH' })
};
