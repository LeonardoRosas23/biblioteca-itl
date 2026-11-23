import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { CLAVE, CLAVE_CIERRE, MENSAJE_OTRA_PESTANA } from '../sesion/SesionContext';
import { API_BASICA, BIBLIO, guardarSesion, renderApp, simularApi } from './utilidades';

const loginOk = (rol = 'BIBLIOTECARIO', expiraEn = 3600) => [
  'POST',
  /\/auth\/login$/,
  { token: 'jwt-real', tipo: 'Bearer', expiraEn, usuario: { ...BIBLIO, rol } }
];

async function entrar(correo = 'biblioteca@itleon.edu.mx', password = 'Biblio2026!') {
  const u = userEvent.setup();
  await u.type(screen.getByLabelText('Correo institucional'), correo);
  await u.type(screen.getByLabelText('Contraseña'), password);
  await u.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
}

describe('Manejo de sesiones', () => {
  test('el login guarda la sesión y entra al panel', async () => {
    const api = simularApi([loginOk(), ...API_BASICA]);
    renderApp('/login');
    await entrar();
    expect(await screen.findByRole('heading', { name: 'Préstamos y devoluciones' })).toBeInTheDocument();
    const guardada = JSON.parse(sessionStorage.getItem(CLAVE));
    expect(guardada.token).toBe('jwt-real');
    expect(guardada.usuario.rol).toBe('BIBLIOTECARIO');
    expect(api.mock.calls[0][1].body).toBe(JSON.stringify({ correo: 'biblioteca@itleon.edu.mx', password: 'Biblio2026!' }));
  });

  test('las peticiones posteriores llevan el token y un X-Correlation-Id', async () => {
    const api = simularApi([loginOk(), ...API_BASICA]);
    renderApp('/login');
    await entrar();
    await screen.findByRole('heading', { name: 'Préstamos y devoluciones' });
    const [, opciones] = api.mock.calls.find(([url]) => url.includes('/api/v1/prestamos'));
    expect(opciones.headers.Authorization).toBe('Bearer jwt-real');
    expect(opciones.headers['X-Correlation-Id']).toMatch(/^[0-9a-f]{6,8}$/);
  });

  test('credenciales incorrectas muestran el mensaje genérico del servidor y no guardan sesión', async () => {
    simularApi([['POST', /\/auth\/login$/, { status: 401, cuerpo: { codigo: 'CREDENCIALES_INVALIDAS', mensaje: 'Correo o contraseña incorrectos.' } }]]);
    renderApp('/login');
    await entrar('biblioteca@itleon.edu.mx', 'mala');
    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos.');
    expect(sessionStorage.getItem(CLAVE)).toBeNull();
  });

  test('campos vacíos se validan antes de llamar al servidor', async () => {
    const api = simularApi([]);
    renderApp('/login');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Captura tu correo institucional y tu contraseña.');
    expect(api).not.toHaveBeenCalled();
  });

  test('un ALUMNO no entra al panel: se le indica usar la app móvil', async () => {
    simularApi([loginOk('ALUMNO')]);
    renderApp('/login');
    await entrar('ana.alumna@itleon.edu.mx');
    expect(await screen.findByRole('alert')).toHaveTextContent('app móvil');
    expect(sessionStorage.getItem(CLAVE)).toBeNull();
  });

  test('la sesión sobrevive a recargar la página', async () => {
    guardarSesion();
    simularApi(API_BASICA);
    renderApp('/multas');
    expect(await screen.findByRole('heading', { name: 'Multas' })).toBeInTheDocument();
    expect(screen.getByText('Laura Bibliotecaria')).toBeInTheDocument();
  });

  test('una sesión guardada pero ya expirada se descarta al abrir', () => {
    guardarSesion({ expiraEnMs: Date.now() - 1000 });
    simularApi(API_BASICA);
    renderApp('/prestamos');
    expect(screen.getByTestId('ruta')).toHaveTextContent('/login');
    expect(sessionStorage.getItem(CLAVE)).toBeNull();
  });

  test('la sesión se cierra sola al expirar el token', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    guardarSesion({ expiraEnMs: Date.now() + 60_000 });
    simularApi(API_BASICA);
    renderApp('/prestamos');
    expect(await screen.findByRole('heading', { name: 'Préstamos y devoluciones' })).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(61_000));
    expect(screen.getByTestId('ruta')).toHaveTextContent('/login');
    expect(screen.getByRole('status')).toHaveTextContent('Tu sesión expiró');
    expect(sessionStorage.getItem(CLAVE)).toBeNull();
  });

  test('un 401 del servidor cierra la sesión y pide iniciar de nuevo', async () => {
    guardarSesion();
    simularApi([['GET', /\/prestamos$/, { status: 401, cuerpo: { codigo: 'NO_AUTENTICADO', mensaje: 'El token es inválido o expiró.' } }], ...API_BASICA]);
    renderApp('/prestamos');
    await waitFor(() => expect(screen.getByTestId('ruta')).toHaveTextContent('/login'));
    expect(screen.getByRole('status')).toHaveTextContent('Tu sesión expiró');
  });

  test('cerrar sesión borra el token y regresa al login', async () => {
    guardarSesion();
    simularApi(API_BASICA);
    renderApp('/prestamos');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
    expect(screen.getByTestId('ruta')).toHaveTextContent('/login');
    expect(sessionStorage.getItem(CLAVE)).toBeNull();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  test('cerrar sesión deja el aviso para las demás pestañas en localStorage', async () => {
    localStorage.clear();
    guardarSesion();
    simularApi(API_BASICA);
    renderApp('/prestamos');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
    expect(JSON.parse(localStorage.getItem(CLAVE_CIERRE))).toMatchObject({ idUsuario: BIBLIO.idUsuario });
  });

  // sessionStorage es independiente por pestaña: el aviso real llega como evento "storage" de localStorage
  const avisoDeOtraPestana = (idUsuario) =>
    act(() => {
      const valor = JSON.stringify({ idUsuario, en: Date.now() });
      localStorage.setItem(CLAVE_CIERRE, valor);
      window.dispatchEvent(new StorageEvent('storage', { key: CLAVE_CIERRE, newValue: valor }));
    });

  test('cerrar sesión en otra pestaña con la misma cuenta también la cierra aquí', async () => {
    localStorage.clear();
    guardarSesion();
    simularApi(API_BASICA);
    renderApp('/prestamos');
    await screen.findByRole('heading', { name: 'Préstamos y devoluciones' });
    avisoDeOtraPestana(BIBLIO.idUsuario);
    expect(screen.getByTestId('ruta')).toHaveTextContent('/login');
    expect(screen.getByText(MENSAJE_OTRA_PESTANA)).toBeInTheDocument();
    expect(sessionStorage.getItem(CLAVE)).toBeNull();
  });

  test('el aviso de otra cuenta no cierra esta pestaña', async () => {
    localStorage.clear();
    guardarSesion();
    simularApi(API_BASICA);
    renderApp('/prestamos');
    await screen.findByRole('heading', { name: 'Préstamos y devoluciones' });
    avisoDeOtraPestana('U999');
    expect(screen.getByTestId('ruta')).toHaveTextContent('/prestamos');
  });

  test('un cambio en la sesión de esta pestaña no se confunde con el aviso', async () => {
    localStorage.clear();
    guardarSesion();
    simularApi(API_BASICA);
    renderApp('/prestamos');
    await screen.findByRole('heading', { name: 'Préstamos y devoluciones' });
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: CLAVE, newValue: null })));
    expect(screen.getByTestId('ruta')).toHaveTextContent('/prestamos');
  });

  test('con sesión abierta, entrar a /login lleva directo al panel', async () => {
    guardarSesion();
    simularApi(API_BASICA);
    renderApp('/login');
    expect(await screen.findByRole('heading', { name: 'Préstamos y devoluciones' })).toBeInTheDocument();
  });
});
