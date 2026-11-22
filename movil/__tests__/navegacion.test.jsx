import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import App from '../src/App';
import { agrupar } from '../src/pantallas/MisPrestamos';
import { columnasPara, fecha } from '../src/tema';
import { API_BASICA, guardarSesion, pagina, simularApi } from './ayuda';

const P101 = {
  idPrestamo: 'P-0101', idUsuario: 'U123', idRecurso: 'R001', tituloRecurso: 'Cálculo diferencial',
  estado: 'PENDIENTE_ENTREGA', reservaVigenteHasta: '2026-10-12T16:15:00Z', fechaDevolucionEstimada: '2026-10-16', renovaciones: 0
};

describe('Navegación de la app (figura 7.1)', () => {
  beforeEach(() => guardarSesion());

  test('barra inferior con Catálogo, Mis préstamos y Avisos', async () => {
    simularApi(API_BASICA);
    render(<App />);
    await screen.findByText('Cálculo diferencial');
    fireEvent.press(screen.getByRole('button', { name: 'Avisos' }));
    expect(await screen.findByText('Aún no tienes avisos.')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Mis préstamos' }));
    expect(await screen.findByText(/No tienes préstamos activos/)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Catálogo' }));
    expect(await screen.findByText('Proyector Epson')).toBeTruthy();
  });

  test('flujo CU01: catálogo → detalle → solicitar → confirmación → Mis préstamos', async () => {
    const api = simularApi([
      ['POST', /\/prestamos$/, { status: 201, cuerpo: P101 }],
      ['GET', /\/prestamos$/, pagina([P101])],
      ...API_BASICA
    ]);
    render(<App />);
    fireEvent.press(await screen.findByRole('button', { name: /Cálculo diferencial/ }));
    expect(await screen.findByText('2 de 3 ejemplares')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Solicitar préstamo' }));
    expect(await screen.findByText('Solicitud registrada')).toBeTruthy();
    expect(screen.getByText('P-0101')).toBeTruthy();
    expect(screen.getByText('12 oct 2026')).toBeTruthy();
    const post = api.mock.calls.find(([, o]) => o?.method === 'POST');
    expect(JSON.parse(post[1].body)).toEqual({ idRecurso: 'R001' });

    fireEvent.press(screen.getByRole('button', { name: 'Ver mis préstamos' }));
    expect(await screen.findByText('Pendiente de recoger')).toBeTruthy();
    expect(screen.getByText(/Recoger antes de: 12 oct 2026/)).toBeTruthy();
  });

  test('un recurso sin existencias tiene el botón deshabilitado', async () => {
    simularApi(API_BASICA);
    render(<App />);
    fireEvent.press(await screen.findByRole('button', { name: /Proyector Epson/ }));
    const boton = await screen.findByRole('button', { name: 'Solicitar préstamo' });
    expect(boton.props.accessibilityState.disabled).toBe(true);
  });

  test('CU01-A2: con multa pendiente se explica dónde verla', async () => {
    simularApi([
      ['POST', /\/prestamos$/, { status: 403, cuerpo: { codigo: 'MULTA_PENDIENTE', mensaje: 'x' } }],
      ...API_BASICA
    ]);
    render(<App />);
    fireEvent.press(await screen.findByRole('button', { name: /Cálculo diferencial/ }));
    fireEvent.press(await screen.findByRole('button', { name: 'Solicitar préstamo' }));
    expect(await screen.findByText('Tienes una multa pendiente. Consulta Mis préstamos para verla.')).toBeTruthy();
  });

  test('CU06: renovar desde Mis préstamos muestra la nueva fecha', async () => {
    const activo = { ...P101, estado: 'ACTIVO' };
    simularApi([
      ['GET', /\/prestamos$/, pagina([activo])],
      ['POST', /\/prestamos\/P-0101\/renovacion$/, { ...activo, renovaciones: 1, fechaDevolucionEstimada: '2026-10-23' }],
      ...API_BASICA
    ]);
    render(<App />);
    fireEvent.press(await screen.findByRole('button', { name: 'Mis préstamos' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Renovar' }));
    expect(await screen.findByText('Renovado. Nueva fecha límite: 23 oct 2026.')).toBeTruthy();
  });

  test('las pestañas de Mis préstamos agrupan por estado y avisan la multa', async () => {
    simularApi([
      ['GET', /\/prestamos$/, pagina([
        { ...P101, idPrestamo: 'P-1', estado: 'ACTIVO' },
        { ...P101, idPrestamo: 'P-2', estado: 'VENCIDO', tituloRecurso: 'Proyector Epson' },
        { ...P101, idPrestamo: 'P-3', estado: 'FINALIZADO', fechaDevolucionReal: '2026-10-09T18:00:00Z', multa: { estadoPago: 'PENDIENTE', montoCalculado: 30 } }
      ])],
      ...API_BASICA
    ]);
    render(<App />);
    fireEvent.press(await screen.findByRole('button', { name: 'Mis préstamos' }));
    expect(await screen.findByText(/Tienes una multa pendiente por \$30\.00/)).toBeTruthy();
    fireEvent.press(screen.getByRole('tab', { name: /Vencidos/ }));
    expect(await screen.findByText('Proyector Epson')).toBeTruthy();
    fireEvent.press(screen.getByRole('tab', { name: /Historial/ }));
    expect(await screen.findByText('Devuelto')).toBeTruthy();
  });

  test('buscar y filtrar por categoría manda los parámetros a Catálogo', async () => {
    const api = simularApi(API_BASICA);
    render(<App />);
    await screen.findByText('Cálculo diferencial');
    fireEvent.changeText(screen.getByLabelText('Buscar recurso'), 'cálculo');
    fireEvent(screen.getByLabelText('Buscar recurso'), 'submitEditing');
    fireEvent.press(screen.getByRole('tab', { name: 'Libros' }));
    await waitFor(() => {
      const url = api.mock.calls.at(-1)[0];
      expect(url).toContain('titulo=c%C3%A1lculo');
      expect(url).toContain('categoria=LIBRO');
    });
  });

  test('avisos: marcar como leído', async () => {
    let leida = false;
    simularApi([
      ['GET', /\/notificaciones$/, () => pagina([{ idNotificacion: 'N-1', tipo: 'RECORDATORIO', mensaje: 'Laptop Lenovo vence mañana', leida, fechaCreacion: '2026-10-19T14:00:00Z' }])],
      ['PATCH', /\/notificaciones\/N-1\/leida$/, () => { leida = true; return {}; }],
      ...API_BASICA
    ]);
    render(<App />);
    fireEvent.press(await screen.findByRole('button', { name: 'Avisos' }));
    expect(await screen.findByText('Nuevo')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: /Recordatorio/ }));
    await waitFor(() => expect(screen.queryByText('Nuevo')).toBeNull());
  });
});

describe('Diseño adaptable y utilidades', () => {
  test('columnas del catálogo según el ancho (teléfono, tableta vertical, tableta horizontal)', () => {
    expect(columnasPara(375)).toBe(1);
    expect(columnasPara(599)).toBe(1);
    expect(columnasPara(768)).toBe(2);
    expect(columnasPara(1180)).toBe(3);
  });

  test('en tableta el catálogo se muestra en 2 columnas', async () => {
    const rn = require('react-native');
    const espia = jest.spyOn(rn, 'useWindowDimensions').mockReturnValue({ width: 820, height: 1180, scale: 2, fontScale: 1 });
    await guardarSesion();
    simularApi(API_BASICA);
    render(<App />);
    await screen.findByText('Cálculo diferencial');
    // Cada tarjeta ocupa la mitad del renglón (flex: 1/2) en lugar del ancho completo
    expect(screen.getByRole('button', { name: /Cálculo diferencial/ })).toHaveStyle({ flex: 0.5 });
    espia.mockRestore();
  });

  test('en teléfono las tarjetas usan el ancho completo', async () => {
    const rn = require('react-native');
    const espia = jest.spyOn(rn, 'useWindowDimensions').mockReturnValue({ width: 375, height: 812, scale: 3, fontScale: 1 });
    await guardarSesion();
    simularApi(API_BASICA);
    render(<App />);
    await screen.findByText('Cálculo diferencial');
    expect(screen.getByRole('button', { name: /Cálculo diferencial/ })).not.toHaveStyle({ flex: 0.5 });
    espia.mockRestore();
  });

  test('fechas en hora de México', () => {
    expect(fecha('2026-10-16')).toBe('16 oct 2026');
    expect(fecha('2026-10-17T05:00:00Z')).toBe('16 oct 2026');
    expect(fecha(null)).toBe('—');
  });

  test('agrupar préstamos', () => {
    const g = agrupar([{ estado: 'ACTIVO' }, { estado: 'PENDIENTE_ENTREGA' }, { estado: 'VENCIDO' }, { estado: 'RECHAZADO' }]);
    expect([g.activos.length, g.vencidos.length, g.historial.length]).toEqual([2, 1, 1]);
  });
});
