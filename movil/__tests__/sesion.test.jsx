import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import App from '../src/App';
import { CLAVE } from '../src/sesion/SesionContext';
import { ANA, API_BASICA, guardarSesion, simularApi } from './ayuda';

async function entrar(correo = 'ana.alumna@itleon.edu.mx', password = 'Biblio2026!') {
  fireEvent.changeText(await screen.findByLabelText('Correo institucional'), correo);
  fireEvent.changeText(screen.getByLabelText('Contraseña'), password);
  fireEvent.press(screen.getByRole('button', { name: 'Iniciar sesión' }));
}

const login = (rol = 'ALUMNO') => ['POST', /\/auth\/login$/, { token: 'jwt-app', tipo: 'Bearer', expiraEn: 3600, usuario: { ...ANA, rol } }];

describe('Sesión en la app móvil', () => {
  test('sin sesión guardada abre el inicio de sesión', async () => {
    simularApi(API_BASICA);
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Iniciar sesión' })).toBeTruthy();
  });

  test('el login guarda el token en el almacén seguro y abre el catálogo', async () => {
    simularApi([login(), ...API_BASICA]);
    render(<App />);
    await entrar();
    expect(await screen.findByText('Cálculo diferencial')).toBeTruthy();
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(CLAVE, expect.stringContaining('"token":"jwt-app"'));
  });

  test('las peticiones llevan el token del usuario', async () => {
    const api = simularApi([login(), ...API_BASICA]);
    render(<App />);
    await entrar();
    await screen.findByText('Cálculo diferencial');
    const [, opciones] = api.mock.calls.find(([u]) => u.includes('/api/v1/recursos'));
    expect(opciones.headers.Authorization).toBe('Bearer jwt-app');
  });

  test('la sesión se restaura al volver a abrir la app', async () => {
    await guardarSesion();
    simularApi(API_BASICA);
    render(<App />);
    expect(await screen.findByText('Cálculo diferencial')).toBeTruthy();
  });

  test('una sesión expirada en el almacén se borra y pide login', async () => {
    await guardarSesion({ expiraEnMs: Date.now() - 1 });
    simularApi(API_BASICA);
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Iniciar sesión' })).toBeTruthy();
    await waitFor(() => expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(CLAVE));
  });

  test('el personal de biblioteca no entra a la app', async () => {
    simularApi([login('BIBLIOTECARIO')]);
    render(<App />);
    await entrar('biblioteca@itleon.edu.mx');
    expect(await screen.findByText(/usa el panel web/)).toBeTruthy();
    expect(await SecureStore.getItemAsync(CLAVE)).toBeNull();
  });

  test('credenciales incorrectas muestran el mensaje del servidor', async () => {
    simularApi([['POST', /\/auth\/login$/, { status: 401, cuerpo: { codigo: 'CREDENCIALES_INVALIDAS', mensaje: 'Correo o contraseña incorrectos.' } }]]);
    render(<App />);
    await entrar('ana.alumna@itleon.edu.mx', 'mala');
    expect(await screen.findByText('Correo o contraseña incorrectos.')).toBeTruthy();
  });

  test('un 401 a mitad del uso cierra la sesión con aviso', async () => {
    await guardarSesion();
    simularApi([['GET', /\/recursos$/, { status: 401, cuerpo: { codigo: 'NO_AUTENTICADO', mensaje: 'El token es inválido o expiró.' } }], ...API_BASICA]);
    render(<App />);
    expect(await screen.findByText('Tu sesión expiró. Inicia sesión de nuevo.')).toBeTruthy();
    expect(await SecureStore.getItemAsync(CLAVE)).toBeNull();
  });

  test('la sesión se cierra sola al expirar el token', async () => {
    await guardarSesion({ expiraEnMs: Date.now() + 1500 });
    simularApi(API_BASICA);
    render(<App />);
    expect(await screen.findByText('Cálculo diferencial')).toBeTruthy();
    expect(await screen.findByText('Tu sesión expiró. Inicia sesión de nuevo.', {}, { timeout: 4000 })).toBeTruthy();
    expect(await SecureStore.getItemAsync(CLAVE)).toBeNull();
  });

  test('cerrar sesión desde Mis préstamos borra el token', async () => {
    await guardarSesion();
    simularApi(API_BASICA);
    render(<App />);
    fireEvent.press(await screen.findByRole('button', { name: 'Mis préstamos' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByRole('button', { name: 'Iniciar sesión' })).toBeTruthy();
    expect(await SecureStore.getItemAsync(CLAVE)).toBeNull();
  });
});
