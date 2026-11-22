import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { API_BASICA, BIBLIO, guardarSesion, renderApp, simularApi } from './utilidades';

describe('Navegabilidad (mapa de la figura 7.1)', () => {
  test('sin sesión, cualquier ruta protegida redirige al login', () => {
    simularApi(API_BASICA);
    for (const ruta of ['/', '/recursos', '/recursos/nuevo', '/prestamos', '/multas']) {
      const { unmount } = renderApp(ruta);
      expect(screen.getByTestId('ruta')).toHaveTextContent('/login');
      unmount();
    }
  });

  test('después de iniciar sesión vuelve a la página que se pidió', async () => {
    simularApi([
      ['POST', /\/auth\/login$/, { token: 't', tipo: 'Bearer', expiraEn: 3600, usuario: BIBLIO }],
      ...API_BASICA
    ]);
    renderApp('/multas');
    const u = userEvent.setup();
    await u.type(screen.getByLabelText('Correo institucional'), 'biblioteca@itleon.edu.mx');
    await u.type(screen.getByLabelText('Contraseña'), 'Biblio2026!');
    await u.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(await screen.findByRole('heading', { name: 'Multas' })).toBeInTheDocument();
    expect(screen.getByTestId('ruta')).toHaveTextContent('/multas');
  });

  test('la raíz abre Préstamos y devoluciones', async () => {
    guardarSesion();
    simularApi(API_BASICA);
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Préstamos y devoluciones' })).toBeInTheDocument();
  });

  test('el menú lleva a cada sección y marca la actual', async () => {
    guardarSesion();
    simularApi(API_BASICA);
    renderApp('/prestamos');
    const u = userEvent.setup();
    const menu = screen.getByRole('navigation', { name: 'Secciones del panel' });

    await u.click(screen.getByRole('link', { name: 'Recursos' }));
    expect(await screen.findByRole('heading', { name: 'Recursos' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Recursos' })).toHaveAttribute('aria-current', 'page');

    await u.click(screen.getByRole('link', { name: 'Multas' }));
    expect(await screen.findByRole('heading', { name: 'Multas' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Recursos' })).not.toHaveAttribute('aria-current');
    expect(menu).toBeInTheDocument();
  });

  test('Recursos → Agregar recurso → Cancelar regresa al listado', async () => {
    guardarSesion();
    simularApi(API_BASICA);
    renderApp('/recursos');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('link', { name: 'Agregar recurso' }));
    expect(await screen.findByRole('heading', { name: 'Agregar recurso' })).toBeInTheDocument();
    expect(screen.getByTestId('ruta')).toHaveTextContent('/recursos/nuevo');
    await u.click(screen.getByRole('link', { name: 'Cancelar' }));
    expect(screen.getByTestId('ruta')).toHaveTextContent(/^\/recursos$/);
  });

  test('las migas del formulario regresan a Recursos', async () => {
    guardarSesion();
    simularApi(API_BASICA);
    renderApp('/recursos/nuevo');
    await userEvent.setup().click(await screen.findByRole('link', { name: 'Recursos', exact: true, hidden: false, description: undefined, current: false }));
    expect(screen.getByTestId('ruta')).toHaveTextContent(/^\/recursos$/);
  });

  test('una ruta inexistente muestra la página 404 con salida', async () => {
    guardarSesion();
    simularApi(API_BASICA);
    renderApp('/no/existe');
    expect(screen.getByRole('heading', { name: 'Esta página no existe' })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('link', { name: 'Préstamos y devoluciones' }));
    expect(screen.getByTestId('ruta')).toHaveTextContent('/prestamos');
  });
});
