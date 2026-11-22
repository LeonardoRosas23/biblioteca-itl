/**
 * Integración front–back (segundo avance): el panel real contra el sistema levantado con Docker,
 * sin simular la API. Se omite si no se define VITE_API_URL.
 *
 *   docker compose up -d --build && ./scripts/cargar-datos-demo.sh
 *   cd web && VITE_API_URL=http://localhost:8080 npx vitest run src/test/integracion.test.jsx
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { renderApp } from './utilidades';

const API = import.meta.env.VITE_API_URL;
const CORRIDA = Math.random().toString(16).slice(2, 7);
const ESPERA = { timeout: 10000 };

async function entrar(u, correo) {
  await u.type(await screen.findByLabelText('Correo institucional'), correo);
  await u.type(screen.getByLabelText('Contraseña'), 'Biblio2026!');
  await u.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
}

describe.skipIf(!API)(`Panel web contra el backend real (${API})`, () => {
  test('el bibliotecario inicia sesión, da de alta un recurso y lo encuentra en el listado', async () => {
    const u = userEvent.setup();
    renderApp('/recursos');
    await entrar(u, 'biblioteca@itleon.edu.mx');
    await screen.findByRole('heading', { name: 'Recursos' }, ESPERA);

    await u.click(screen.getByRole('link', { name: 'Agregar recurso' }));
    const titulo = `Calculadora graficadora ${CORRIDA}`;
    await screen.findByRole('option', { name: 'Equipo' }, ESPERA);
    await u.type(screen.getByLabelText('Título *'), titulo);
    await u.selectOptions(screen.getByLabelText('Categoría *'), 'EQUIPO');
    await u.type(screen.getByLabelText('Ubicación *'), 'Mostrador');
    await u.click(screen.getByRole('button', { name: 'Agregar recurso' }));

    await u.type(await screen.findByPlaceholderText('Buscar por título o código', {}, ESPERA), CORRIDA);
    await u.click(screen.getByRole('button', { name: 'Buscar' }));
    const fila = (await screen.findByText(titulo, {}, ESPERA)).closest('tr');
    expect(within(fila).getByText('Disponible')).toBeInTheDocument();
  }, 30000);

  test('préstamos y multas de los datos de demostración se ven en el panel', async () => {
    const u = userEvent.setup();
    renderApp('/prestamos');
    await entrar(u, 'biblioteca@itleon.edu.mx');
    await u.type(await screen.findByPlaceholderText(/Folio/, {}, ESPERA), 'P-0003');
    await u.click(screen.getByRole('button', { name: 'Buscar' }));
    const fila = (await screen.findByText('Proyector Epson', {}, ESPERA)).closest('tr');
    expect(within(fila).getByText('Vencido')).toBeInTheDocument();
    expect(within(fila).getByRole('button', { name: 'Registrar devolución' })).toBeInTheDocument();

    await u.click(screen.getByRole('link', { name: 'Multas' }));
    const multa = (await screen.findByText('M-0001', {}, ESPERA)).closest('tr');
    expect(within(multa).getByText('U103')).toBeInTheDocument();
    expect(within(multa).getByText('Pendiente de pago')).toBeInTheDocument();
  }, 30000);

  test('el administrador ve las cuentas y un alumno no puede entrar al panel', async () => {
    const u = userEvent.setup();
    renderApp('/usuarios');
    await entrar(u, 'admin@itleon.edu.mx');
    expect(await screen.findByText('ana.alumna@itleon.edu.mx', {}, ESPERA)).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    await entrar(u, 'ana.alumna@itleon.edu.mx');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Alumnos y profesores usan la app'), ESPERA);
  }, 30000);
});
