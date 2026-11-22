import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { validarCuenta } from '../paginas/Usuarios';
import { API_BASICA, BIBLIO, guardarSesion, pagina, renderApp, simularApi } from './utilidades';

const ADMIN = { idUsuario: 'U100', nombre: 'Administrador General', correo: 'admin@itleon.edu.mx', rol: 'ADMIN' };
const ANA = { idUsuario: 'U102', nombre: 'Ana Alumna', correo: 'ana.alumna@itleon.edu.mx', rol: 'ALUMNO', estado: 'ACTIVO', fechaRegistro: '2026-10-01T12:00:00Z' };

const API_USUARIOS = [['GET', /\/api\/v1\/usuarios$/, pagina([ANA, { ...ADMIN, estado: 'ACTIVO' }])], ...API_BASICA];

describe('Administración de usuarios (sección 5.7)', () => {
  test('el menú muestra "Usuarios" solo al administrador', async () => {
    guardarSesion({ usuario: BIBLIO });
    simularApi(API_USUARIOS);
    renderApp('/prestamos');
    await screen.findByRole('link', { name: 'Préstamos y devoluciones' });
    expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument();
  });

  test('un bibliotecario que entra a /usuarios ve el aviso de acceso', async () => {
    guardarSesion({ usuario: BIBLIO });
    simularApi(API_USUARIOS);
    renderApp('/usuarios');
    expect(await screen.findByText('No tienes acceso a esta sección')).toBeInTheDocument();
  });

  test('el administrador ve las cuentas con rol y estado en texto', async () => {
    guardarSesion({ usuario: ADMIN });
    simularApi(API_USUARIOS);
    renderApp('/usuarios');
    const fila = (await screen.findByText('Ana Alumna')).closest('tr');
    expect(within(fila).getByText('Alumno')).toBeInTheDocument();
    expect(within(fila).getByText('Activa')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Usuarios' })).toBeInTheDocument();
  });

  test('bloquear una cuenta envía solo el cambio y muestra la confirmación', async () => {
    guardarSesion({ usuario: ADMIN });
    let enviado;
    simularApi([
      ['PATCH', /\/usuarios\/U102\/estado$/, (_u, o) => { enviado = JSON.parse(o.body); return { ...ANA, estado: 'BLOQUEADO' }; }],
      ...API_USUARIOS
    ]);
    renderApp('/usuarios');
    const u = userEvent.setup();
    const fila = (await screen.findByText('Ana Alumna')).closest('tr');
    await u.click(within(fila).getByRole('button', { name: 'Administrar' }));
    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
    await u.selectOptions(within(dialogo).getByLabelText('Estado de la cuenta'), 'BLOQUEADO');
    expect(within(dialogo).getByText(/no podrá iniciar sesión/)).toBeInTheDocument();
    await u.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('Cuenta U102 actualizada.')).toBeInTheDocument();
    expect(enviado).toEqual({ estado: 'BLOQUEADO' });
  });

  test('si el servidor rechaza el cambio, el mensaje se muestra en el diálogo', async () => {
    guardarSesion({ usuario: ADMIN });
    simularApi([
      ['PATCH', /\/usuarios\/U100\/estado$/, { status: 409, cuerpo: { codigo: 'AUTOBLOQUEO', mensaje: 'Un administrador no puede bloquear su propia cuenta.' } }],
      ...API_USUARIOS
    ]);
    renderApp('/usuarios');
    const u = userEvent.setup();
    await screen.findByText('Ana Alumna');
    const fila = within(screen.getByRole('table')).getByText('admin@itleon.edu.mx').closest('tr');
    await u.click(within(fila).getByRole('button', { name: 'Administrar' }));
    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByText(/Es tu propia cuenta/)).toBeInTheDocument();
    await u.selectOptions(within(dialogo).getByLabelText('Estado de la cuenta'), 'BLOQUEADO');
    await u.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }));
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('no puede bloquear su propia cuenta');
  });

  test('agregar una cuenta de personal valida antes de enviar y luego crea con el rol elegido', async () => {
    guardarSesion({ usuario: ADMIN });
    let enviado;
    simularApi([
      ['POST', /\/api\/v1\/usuarios$/, (_u, o) => { enviado = JSON.parse(o.body); return { status: 201, cuerpo: { idUsuario: 'U110', correo: enviado.correo } }; }],
      ...API_USUARIOS
    ]);
    renderApp('/usuarios');
    const u = userEvent.setup();
    await screen.findByText('Ana Alumna');
    await u.click(screen.getByRole('button', { name: 'Agregar cuenta' }));
    const dialogo = screen.getByRole('dialog');
    await u.click(within(dialogo).getByRole('button', { name: 'Crear cuenta' }));
    expect(within(dialogo).getByText('Escribe el nombre completo.')).toBeInTheDocument();
    expect(enviado).toBeUndefined();

    await u.type(within(dialogo).getByLabelText('Nombre *'), 'Pedro Bibliotecario');
    await u.type(within(dialogo).getByLabelText('Correo institucional *'), 'pedro@itleon.edu.mx');
    await u.type(within(dialogo).getByLabelText('Contraseña inicial *'), 'Biblio2026!');
    await u.click(within(dialogo).getByRole('button', { name: 'Crear cuenta' }));
    expect(await screen.findByText('Cuenta U110 creada para pedro@itleon.edu.mx.')).toBeInTheDocument();
    expect(enviado).toEqual({ nombre: 'Pedro Bibliotecario', correo: 'pedro@itleon.edu.mx', password: 'Biblio2026!', rol: 'BIBLIOTECARIO' });
  });

  test('la búsqueda y el rol se envían como parámetros', async () => {
    guardarSesion({ usuario: ADMIN });
    const api = simularApi(API_USUARIOS);
    renderApp('/usuarios');
    const u = userEvent.setup();
    await screen.findByText('Ana Alumna');
    await u.type(screen.getByPlaceholderText('Nombre, correo o código (U123)'), 'ana');
    await u.click(screen.getByRole('button', { name: 'Buscar' }));
    await u.selectOptions(screen.getByLabelText('Rol'), 'ALUMNO');
    await waitFor(() => {
      const url = new URL(api.mock.calls.at(-1)[0]);
      expect(url.searchParams.get('q')).toBe('ana');
      expect(url.searchParams.get('rol')).toBe('ALUMNO');
    });
  });

  test('validarCuenta', () => {
    expect(validarCuenta({ nombre: '', correo: 'x', password: '123' })).toEqual({
      nombre: expect.any(String), correo: expect.any(String), password: expect.any(String)
    });
    expect(validarCuenta({ nombre: 'A', correo: 'a@b.mx', password: '12345678' })).toEqual({});
  });
});
