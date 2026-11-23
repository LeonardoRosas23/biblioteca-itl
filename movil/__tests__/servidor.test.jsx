import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { CLAVE_SERVIDOR, normalizarServidor } from '../src/api/cliente';
import App from '../src/App';
import { ANA, API_BASICA, simularApi } from './ayuda';

const login = ['POST', /\/auth\/login$/, { token: 'jwt-app', tipo: 'Bearer', expiraEn: 3600, usuario: ANA }];
const salud = ['GET', /^\/health$/, { estado: 'ok' }];

describe('Dirección del servidor configurable desde la app', () => {
  beforeEach(() => jest.clearAllMocks());

  test('normaliza lo que escribe la persona', () => {
    expect(normalizarServidor('192.168.1.50:8080')).toBe('http://192.168.1.50:8080');
    expect(normalizarServidor(' http://localhost:8080/ ')).toBe('http://localhost:8080');
    expect(normalizarServidor('HTTPS://biblio.cloudapp.azure.com')).toBe('https://biblio.cloudapp.azure.com');
    expect(normalizarServidor('')).toBeNull();
    expect(normalizarServidor('http://a b')).toBeNull();
    expect(normalizarServidor('ftp://x')).toBeNull();
  });

  test('cambiar el servidor lo prueba, lo guarda y las peticiones usan la nueva dirección', async () => {
    const api = simularApi([salud, login, ...API_BASICA]);
    render(<App />);
    fireEvent.press(await screen.findByRole('button', { name: 'Cambiar servidor' }));
    fireEvent.changeText(screen.getByLabelText('Dirección del servidor'), '192.168.1.50:8080');
    fireEvent.press(screen.getByRole('button', { name: 'Probar y guardar' }));
    expect(await screen.findByText('Conectado con el servidor.')).toBeTruthy();
    expect(screen.getByText('http://192.168.1.50:8080')).toBeTruthy();
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(CLAVE_SERVIDOR, 'http://192.168.1.50:8080');

    fireEvent.changeText(screen.getByLabelText('Correo institucional'), 'ana.alumna@itleon.edu.mx');
    fireEvent.changeText(screen.getByLabelText('Contraseña'), 'Biblio2026!');
    fireEvent.press(screen.getByRole('button', { name: 'Iniciar sesión' }));
    await screen.findByText('Cálculo diferencial');
    const urlLogin = api.mock.calls.find(([u]) => u.endsWith('/api/v1/auth/login'))[0];
    expect(urlLogin).toBe('http://192.168.1.50:8080/api/v1/auth/login');
  });

  test('si el servidor no responde, avisa y no cambia la dirección', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('sin red')));
    render(<App />);
    fireEvent.press(await screen.findByRole('button', { name: 'Cambiar servidor' }));
    fireEvent.changeText(screen.getByLabelText('Dirección del servidor'), '10.0.0.9:8080');
    fireEvent.press(screen.getByRole('button', { name: 'Probar y guardar' }));
    expect(await screen.findByText(/No responde http:\/\/10\.0\.0\.9:8080/)).toBeTruthy();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalledWith(CLAVE_SERVIDOR, expect.anything());
  });

  test('una dirección mal escrita se rechaza sin intentar conectarse', async () => {
    const api = simularApi([salud]);
    render(<App />);
    fireEvent.press(await screen.findByRole('button', { name: 'Cambiar servidor' }));
    fireEvent.changeText(screen.getByLabelText('Dirección del servidor'), 'mi servidor');
    fireEvent.press(screen.getByRole('button', { name: 'Probar y guardar' }));
    expect(screen.getByText(/Escribe una dirección como/)).toBeTruthy();
    expect(api).not.toHaveBeenCalled();
  });

  test('sin dirección guardada se usa la de fábrica', async () => {
    simularApi(API_BASICA);
    render(<App />);
    expect(await screen.findByText('http://localhost:8080')).toBeTruthy();
  });

  test('la dirección guardada se recupera al abrir la app', async () => {
    await SecureStore.setItemAsync(CLAVE_SERVIDOR, 'http://192.168.0.7:8080');
    simularApi(API_BASICA);
    render(<App />);
    expect(await screen.findByText('http://192.168.0.7:8080')).toBeTruthy();
  });
});
