import * as SecureStore from 'expo-secure-store';

// Cliente HTTP de la app: mismo contrato que el panel (JWT, X-Correlation-Id, formato de error común).

export class ApiError extends Error {
  constructor(status, codigo, mensaje) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
  }
}

// Dirección del gateway. La de fábrica viene de EXPO_PUBLIC_API_URL al compilar; la persona puede cambiarla
// desde la pantalla de inicio de sesión ("Servidor"), y se guarda en el teléfono. Así un mismo APK sirve
// con la laptop en cualquier red Wi-Fi (http://IP-de-la-laptop:8080), por cable USB con
// "adb reverse" (http://localhost:8080) o con un servidor en la nube (https://…).
export const API_URL_FABRICA = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8080';
export const CLAVE_SERVIDOR = 'biblio.app.servidor';
let apiUrl = API_URL_FABRICA;

export const servidorActual = () => apiUrl;

/** Acepta "192.168.1.50:8080", "http://192.168.1.50:8080/" o "https://dominio"; devuelve null si no es válida. */
export function normalizarServidor(texto) {
  let t = String(texto || '').trim();
  if (!t) return null;
  if (!/^https?:\/\//i.test(t)) t = `http://${t}`;
  t = t.replace(/\/+$/, '').replace(/^https?/i, (m) => m.toLowerCase());
  return /^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/.test(t) ? t : null;
}

export async function cargarServidor() {
  try {
    apiUrl = (await SecureStore.getItemAsync(CLAVE_SERVIDOR)) || API_URL_FABRICA;
  } catch {
    // sin almacén disponible: se usa la dirección de fábrica
  }
  return apiUrl;
}

export async function guardarServidor(url) {
  apiUrl = url;
  await SecureStore.setItemAsync(CLAVE_SERVIDOR, url);
}

/** true si el gateway responde en url/health antes de 5 segundos. */
export async function probarServidor(url) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = setTimeout(() => ctrl?.abort(), 5000);
  try {
    const r = await fetch(`${url}/health`, { signal: ctrl?.signal });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

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
    res = await fetch(`${apiUrl}${ruta}${qs ? `?${qs}` : ''}`, {
      method: metodo,
      headers: cabeceras,
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined
    });
  } catch {
    throw new ApiError(
      0,
      'SIN_CONEXION',
      `No hay conexión con la biblioteca (${apiUrl}). Revisa tu conexión o la dirección del servidor e inténtalo de nuevo.`
    );
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
