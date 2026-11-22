import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { API_BASICA, guardarSesion, pagina, renderApp, simularApi } from './utilidades';

const PRESTAMO = {
  idPrestamo: 'P-0101', idUsuario: 'U123', idRecurso: 'R001', tituloRecurso: 'Cálculo diferencial',
  estado: 'ACTIVO', fechaDevolucionEstimada: '2099-10-16'
};

describe('Comportamiento responsivo', () => {
  test('escritorio (1280 px): menú lateral siempre visible y sin botón de menú', async () => {
    guardarSesion();
    simularApi(API_BASICA);
    renderApp('/prestamos');
    expect(screen.getByRole('navigation', { name: 'Secciones del panel' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Menú' })).not.toBeInTheDocument();
    expect(screen.getByText('Laura Bibliotecaria')).toBeInTheDocument();
  });

  test('tableta vertical (768 px): el menú se oculta tras un botón con aria-expanded', async () => {
    cambiarAncho(768);
    guardarSesion();
    simularApi(API_BASICA);
    renderApp('/prestamos');
    const boton = screen.getByRole('button', { name: 'Menú' });
    expect(boton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('navigation', { name: 'Secciones del panel' })).not.toBeInTheDocument();

    const u = userEvent.setup();
    await u.click(boton);
    expect(screen.getByRole('button', { name: 'Cerrar menú' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('navigation', { name: 'Secciones del panel' })).toBeVisible();
  });

  test('teléfono (375 px): el menú se cierra al navegar y con Escape', async () => {
    cambiarAncho(375);
    guardarSesion();
    simularApi(API_BASICA);
    renderApp('/prestamos');
    const u = userEvent.setup();

    await u.click(screen.getByRole('button', { name: 'Menú' }));
    await u.click(screen.getByRole('link', { name: 'Multas' }));
    expect(await screen.findByRole('heading', { name: 'Multas' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Secciones del panel' })).not.toBeInTheDocument();

    await u.click(screen.getByRole('button', { name: 'Menú' }));
    await u.keyboard('{Escape}');
    expect(screen.queryByRole('navigation', { name: 'Secciones del panel' })).not.toBeInTheDocument();
  });

  test('al girar de vertical a horizontal el diseño cambia sin recargar', async () => {
    cambiarAncho(600);
    guardarSesion();
    simularApi(API_BASICA);
    renderApp('/prestamos');
    expect(screen.getByRole('button', { name: 'Menú' })).toBeInTheDocument();
    act(() => cambiarAncho(1100));
    expect(screen.queryByRole('button', { name: 'Menú' })).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Secciones del panel' })).toBeVisible();
  });

  test('las celdas de la tabla llevan su título para apilarse en pantallas angostas', async () => {
    cambiarAncho(375);
    guardarSesion();
    simularApi([['GET', /\/prestamos$/, pagina([PRESTAMO])], ...API_BASICA]);
    renderApp('/prestamos');
    const celda = await screen.findByText('Cálculo diferencial');
    expect(celda.closest('td')).toHaveAttribute('data-titulo', 'Recurso');
    expect(screen.getByText('P-0101').closest('td')).toHaveAttribute('data-titulo', 'Folio');
  });

  test('la hoja de estilos define el punto de quiebre y áreas táctiles de 44 px', () => {
    const css = readFileSync(resolve(__dirname, '../estilos.css'), 'utf8');
    expect(css).toMatch(/@media \(max-width: 899px\)/);
    expect(css).toMatch(/\.tabla td\[data-titulo\]::before/);
    expect((css.match(/min-height: 44px/g) || []).length).toBeGreaterThanOrEqual(4);
    expect(css).toMatch(/prefers-reduced-motion/);
  });
});
