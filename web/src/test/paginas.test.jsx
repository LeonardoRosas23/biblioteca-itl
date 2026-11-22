import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { validarRecurso } from '../paginas/FormRecurso';
import { diasDeRetraso } from '../paginas/Prestamos';
import { API_BASICA, CATEGORIAS, guardarSesion, pagina, renderApp, simularApi } from './utilidades';

const RECURSO = {
  idRecurso: 'R001', titulo: 'Cálculo diferencial', categoria: 'LIBRO', ubicacion: 'Estante B-12',
  existencias: 3, disponibles: 2, estado: 'DISPONIBLE'
};

describe('Recursos (CU03)', () => {
  test('muestra el estado con texto y la disponibilidad', async () => {
    guardarSesion();
    simularApi([['GET', /\/recursos$/, pagina([RECURSO, { ...RECURSO, idRecurso: 'R102', titulo: 'Proyector', estado: 'MANTENIMIENTO', disponibles: 0, existencias: 1 }])], ...API_BASICA]);
    renderApp('/recursos');
    const fila = (await screen.findByText('Cálculo diferencial')).closest('tr');
    expect(within(fila).getByText('Disponible')).toBeInTheDocument();
    expect(within(fila).getByText('2 / 3')).toBeInTheDocument();
    const fila2 = screen.getByText('Proyector').closest('tr');
    expect(within(fila2).getByText('En mantenimiento')).toBeInTheDocument();
    expect(within(fila2).getByText('0 / 1')).toBeInTheDocument();
  });

  test('la búsqueda y los filtros se envían como parámetros', async () => {
    guardarSesion();
    const api = simularApi([['GET', /\/recursos$/, pagina([RECURSO])], ...API_BASICA]);
    renderApp('/recursos');
    const u = userEvent.setup();
    await screen.findByText('Cálculo diferencial');
    await u.type(screen.getByPlaceholderText('Buscar por título o código'), 'cálculo');
    await u.click(screen.getByRole('button', { name: 'Buscar' }));
    await u.selectOptions(screen.getByLabelText('Categoría'), 'LIBRO');
    await waitFor(() => {
      const url = new URL(api.mock.calls.at(-1)[0]);
      expect(url.searchParams.get('titulo')).toBe('cálculo');
      expect(url.searchParams.get('categoria')).toBe('LIBRO');
      expect(url.searchParams.get('pagina')).toBe('1');
    });
  });

  test('sin resultados ofrece limpiar los filtros', async () => {
    guardarSesion();
    simularApi(API_BASICA);
    renderApp('/recursos');
    expect(await screen.findByText('No se encontraron recursos con esos filtros.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeInTheDocument();
  });

  test('el formulario marca cada campo obligatorio que falta y no envía', async () => {
    guardarSesion();
    const api = simularApi(API_BASICA);
    renderApp('/recursos/nuevo');
    const u = userEvent.setup();
    await screen.findByRole('option', { name: 'Libro' });
    await u.clear(screen.getByLabelText('Existencias *'));
    await u.click(screen.getByRole('button', { name: 'Agregar recurso' }));
    expect(screen.getByText('Escribe el título del recurso.')).toBeInTheDocument();
    expect(screen.getByText('Elige una categoría.')).toBeInTheDocument();
    expect(screen.getByText('Usa un número entero entre 0 y 9999.')).toBeInTheDocument();
    expect(screen.getByLabelText('Título *')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Título *')).toHaveFocus();
    expect(api.mock.calls.some(([, o]) => o?.method === 'POST')).toBe(false);
  });

  test('alta correcta envía el JSON del contrato y regresa con aviso', async () => {
    guardarSesion();
    let enviado;
    simularApi([
      ['POST', /\/recursos$/, (_u, o) => { enviado = JSON.parse(o.body); return { status: 201, cuerpo: { ...RECURSO, idRecurso: 'R009' } }; }],
      ...API_BASICA
    ]);
    renderApp('/recursos/nuevo');
    const u = userEvent.setup();
    await screen.findByRole('option', { name: 'Equipo' });
    await u.type(screen.getByLabelText('Título *'), 'Laptop Lenovo ThinkPad');
    await u.selectOptions(screen.getByLabelText('Categoría *'), 'EQUIPO');
    await u.type(screen.getByLabelText('Ubicación *'), 'Mostrador');
    await u.click(screen.getByRole('button', { name: 'Agregar recurso' }));
    expect(await screen.findByText('Recurso agregado.')).toBeInTheDocument();
    expect(enviado).toEqual({ titulo: 'Laptop Lenovo ThinkPad', categoria: 'EQUIPO', ubicacion: 'Mostrador', existencias: 1, descripcion: null, estado: 'DISPONIBLE' });
  });

  test('un 409 del servidor al dar de baja se muestra tal cual', async () => {
    guardarSesion();
    simularApi([
      ['GET', /\/recursos\/R001$/, { ...RECURSO, estado: 'RESERVADO' }],
      ['PATCH', /\/recursos\/R001\/estado$/, { status: 409, cuerpo: { codigo: 'RECURSO_EN_USO', mensaje: 'El recurso tiene ejemplares reservados o prestados; espera a que se devuelvan.' } }],
      ...API_BASICA
    ]);
    renderApp('/recursos/R001/editar');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Dar de baja' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('espera a que se devuelvan');
  });

  test('validarRecurso (unitaria)', () => {
    const ok = { titulo: 'Libro', categoria: 'LIBRO', ubicacion: 'A-1', existencias: '3' };
    expect(validarRecurso(ok)).toEqual({});
    expect(validarRecurso({ ...ok, existencias: '2.5' })).toHaveProperty('existencias');
    expect(validarRecurso({ ...ok, existencias: '-1' })).toHaveProperty('existencias');
    expect(validarRecurso({ ...ok, titulo: 'x'.repeat(201) })).toHaveProperty('titulo');
    expect(CATEGORIAS).toHaveLength(3);
  });
});

describe('Préstamos y devoluciones (CU04, CU05)', () => {
  const pendiente = { idPrestamo: 'P-0101', idUsuario: 'U123', tituloRecurso: 'Cálculo diferencial', estado: 'PENDIENTE_ENTREGA', reservaVigenteHasta: '2026-10-12T16:15:00Z', fechaDevolucionEstimada: '2026-10-16' };
  const vencido = { idPrestamo: 'P-0090', idUsuario: 'U044', tituloRecurso: 'Proyector Epson', estado: 'VENCIDO', fechaDevolucionEstimada: '2026-10-06' };

  test('aprobar entrega pide confirmación y muestra la fecha límite', async () => {
    guardarSesion();
    let aprobado = false;
    simularApi([
      ['GET', /\/prestamos$/, pagina([pendiente])],
      ['PATCH', /\/prestamos\/P-0101\/aprobar$/, () => { aprobado = true; return { ...pendiente, estado: 'ACTIVO' }; }],
      ...API_BASICA
    ]);
    renderApp('/prestamos');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Aprobar entrega' }));
    const dialogo = screen.getByRole('dialog', { name: /Aprobar entrega/ });
    expect(aprobado).toBe(false);
    await u.click(within(dialogo).getByRole('button', { name: 'Aprobar entrega' }));
    expect(await screen.findByText(/Entrega aprobada/)).toHaveTextContent('vence el 16 oct 2026');
    expect(aprobado).toBe(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('la devolución muestra la tarjeta de fechas y el resultado con multa', async () => {
    guardarSesion();
    let cuerpo;
    simularApi([
      ['GET', /\/prestamos$/, pagina([vencido])],
      ['POST', /\/prestamos\/P-0090\/devolucion$/, (_u, o) => { cuerpo = JSON.parse(o.body); return { idPrestamo: 'P-0090', estado: 'FINALIZADO', diasRetraso: 3, multa: { idMulta: 'M-0007', montoCalculado: 30 } }; }],
      ...API_BASICA
    ]);
    renderApp('/prestamos');
    const u = userEvent.setup();
    expect(await screen.findByText('Vencido')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Registrar devolución' }));
    const ficha = screen.getByLabelText('Resumen de la devolución');
    expect(within(ficha).getByText('06 oct 2026')).toBeInTheDocument();
    expect(within(ficha).getByText(/Multa estimada/)).toBeInTheDocument();
    await u.click(screen.getByLabelText(/presenta daños/));
    await u.click(screen.getByRole('button', { name: 'Confirmar devolución' }));
    expect(await screen.findByText(/Multa M-0007 de \$30\.00/)).toBeInTheDocument();
    expect(cuerpo).toEqual({ danado: true });
  });

  test('Escape cierra el diálogo sin ejecutar la acción', async () => {
    guardarSesion();
    simularApi([['GET', /\/prestamos$/, pagina([pendiente])], ...API_BASICA]);
    renderApp('/prestamos');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Aprobar entrega' }));
    await u.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('si la reserva expiró, el 409 se explica dentro del diálogo', async () => {
    guardarSesion();
    simularApi([
      ['GET', /\/prestamos$/, pagina([pendiente])],
      ['PATCH', /\/aprobar$/, { status: 409, cuerpo: { codigo: 'RESERVA_EXPIRADA', mensaje: 'La reserva expiró; el préstamo se rechazó y el recurso se liberó.' } }],
      ...API_BASICA
    ]);
    renderApp('/prestamos');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Aprobar entrega' }));
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Aprobar entrega' }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('La reserva expiró');
  });

  test('buscar "P-0101" filtra por folio y "U123" por usuario', async () => {
    guardarSesion();
    const api = simularApi([['GET', /\/prestamos$/, pagina([pendiente])], ...API_BASICA]);
    renderApp('/prestamos');
    const u = userEvent.setup();
    const caja = await screen.findByPlaceholderText(/Folio/);
    await u.type(caja, 'p-0101{Enter}');
    await waitFor(() => expect(new URL(api.mock.calls.at(-1)[0]).searchParams.get('folio')).toBe('P-0101'));
    await u.clear(caja);
    await u.type(caja, 'u123{Enter}');
    await waitFor(() => expect(new URL(api.mock.calls.at(-1)[0]).searchParams.get('idUsuario')).toBe('U123'));
  });

  test('diasDeRetraso usa el fin del día límite en hora de México', () => {
    expect(diasDeRetraso('2026-10-06', new Date('2026-10-07T05:00:00Z'))).toBe(0); // 6 oct 23:00 en León
    expect(diasDeRetraso('2026-10-06', new Date('2026-10-09T18:00:00Z'))).toBe(3);
  });
});

describe('Multas', () => {
  test('registrar el pago de una multa pendiente', async () => {
    guardarSesion();
    let estado;
    simularApi([
      ['GET', /\/multas$/, pagina([{ idMulta: 'M-0007', idUsuario: 'U044', idPrestamo: 'P-0090', diasRetraso: 3, montoCalculado: 30, estadoPago: 'PENDIENTE', fechaGeneracion: '2026-10-09T18:30:00Z' }])],
      ['PATCH', /\/multas\/M-0007\/estado$/, (_u, o) => { estado = JSON.parse(o.body).estadoPago; return { estadoPago: estado }; }],
      ...API_BASICA
    ]);
    renderApp('/multas');
    const u = userEvent.setup();
    expect(await screen.findByText('Pendiente de pago')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Registrar pago' }));
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Registrar pago' }));
    expect(await screen.findByText('Pago registrado para M-0007.')).toBeInTheDocument();
    expect(estado).toBe('PAGADA');
  });

  test('sin conexión se muestra un mensaje que dice qué hacer', async () => {
    guardarSesion();
    const { vi } = await import('vitest');
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    renderApp('/multas');
    expect(await screen.findByRole('alert')).toHaveTextContent('No hay conexión con el servidor');
  });
});
