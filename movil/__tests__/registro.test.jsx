import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import App from '../src/App';
import { validarRegistro } from '../src/pantallas/Registro';
import { CLAVE } from '../src/sesion/SesionContext';
import { ANA, API_BASICA, simularApi } from './ayuda';

const login = ['POST', /\/auth\/login$/, { token: 'jwt-app', tipo: 'Bearer', expiraEn: 3600, usuario: ANA }];

async function abrirRegistro() {
  render(<App />);
  fireEvent.press(await screen.findByRole('button', { name: 'Regístrate' }));
  return screen.findByRole('button', { name: 'Crear cuenta' });
}

function llenar({ nombre = 'Ana Alumna', correo = 'Ana.Alumna@itleon.edu.mx', password = 'Biblio2026!', confirmacion = password } = {}) {
  fireEvent.changeText(screen.getByLabelText('Nombre completo'), nombre);
  fireEvent.changeText(screen.getByLabelText('Correo institucional'), correo);
  fireEvent.changeText(screen.getByLabelText('Contraseña'), password);
  fireEvent.changeText(screen.getByLabelText('Confirmar contraseña'), confirmacion);
}

describe('Registro en la app (CU08-A3)', () => {
  test('el login lleva al registro y se puede regresar', async () => {
    simularApi(API_BASICA);
    await abrirRegistro();
    fireEvent.press(screen.getByRole('button', { name: 'Ya tengo cuenta' }));
    expect(await screen.findByRole('button', { name: 'Iniciar sesión' })).toBeTruthy();
  });

  test('marca los campos con problemas y no envía nada', async () => {
    const api = simularApi(API_BASICA);
    await abrirRegistro();
    llenar({ nombre: '', correo: 'ana', password: 'Biblio2026!', confirmacion: 'otra-cosa' });
    fireEvent.press(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(screen.getByText('Escribe tu nombre completo.')).toBeTruthy();
    expect(screen.getByText(/correo institucional \(nombre@/)).toBeTruthy();
    expect(screen.getByText('Las contraseñas no coinciden.')).toBeTruthy();
    expect(api.mock.calls.some(([, o]) => o?.method === 'POST')).toBe(false);
  });

  test('registra como profesor, inicia sesión y abre el catálogo', async () => {
    let enviado;
    simularApi([
      ['POST', /\/api\/v1\/usuarios$/, (_u, o) => { enviado = JSON.parse(o.body); return { status: 201, cuerpo: { idUsuario: 'U200' } }; }],
      login,
      ...API_BASICA
    ]);
    await abrirRegistro();
    llenar();
    fireEvent.press(screen.getByRole('radio', { name: 'Profesor' }));
    fireEvent.press(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(await screen.findByText('Cálculo diferencial')).toBeTruthy();
    expect(enviado).toEqual({ nombre: 'Ana Alumna', correo: 'ana.alumna@itleon.edu.mx', password: 'Biblio2026!', rol: 'PROFESOR' });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(CLAVE, expect.stringContaining('jwt-app'));
  });

  test('si el correo ya existe muestra el mensaje del servidor (409)', async () => {
    simularApi([
      ['POST', /\/api\/v1\/usuarios$/, { status: 409, cuerpo: { codigo: 'CORREO_REGISTRADO', mensaje: 'Ya existe una cuenta con ese correo.' } }],
      ...API_BASICA
    ]);
    await abrirRegistro();
    llenar();
    fireEvent.press(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(await screen.findByText('Ya existe una cuenta con ese correo.')).toBeTruthy();
  });

  test('muestra en vivo qué requisitos de la contraseña faltan y no envía una débil', async () => {
    const api = simularApi(API_BASICA);
    await abrirRegistro();
    llenar({ password: 'biblioteca', confirmacion: 'biblioteca' });
    expect(screen.getByLabelText('Una letra mayúscula: falta')).toBeTruthy();
    expect(screen.getByLabelText('Una letra minúscula: cumple')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(screen.getByText(/La contraseña debe cumplir: .*mayúscula.*número.*especial/)).toBeTruthy();
    expect(api.mock.calls.some(([, o]) => o?.method === 'POST')).toBe(false);
    fireEvent.changeText(screen.getByLabelText('Contraseña'), 'Biblio2026!');
    expect(screen.getByLabelText('Un carácter especial (! @ # $ % & * - _ . ?): cumple')).toBeTruthy();
  });

  test('validarRegistro', () => {
    expect(validarRegistro({ nombre: 'A', correo: 'a@b.mx', password: '1234567', confirmacion: '1234567' }).password).toBeTruthy();
    expect(validarRegistro({ nombre: 'A', correo: 'a@b.mx', password: '12345678', confirmacion: '12345678' }).password).toMatch(/mayúscula/);
    expect(validarRegistro({ nombre: 'A', correo: 'a@b.mx', password: 'Biblio2026!', confirmacion: 'Biblio2026!' })).toEqual({});
  });
});
