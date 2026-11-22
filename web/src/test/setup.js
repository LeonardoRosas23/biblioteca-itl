import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// matchMedia simulado que responde al ancho actual de la ventana (para probar el diseño responsivo)
const oyentes = new Set();
function evaluar(consulta, ancho) {
  const max = /max-width:\s*(\d+)px/.exec(consulta);
  const min = /min-width:\s*(\d+)px/.exec(consulta);
  return (!max || ancho <= Number(max[1])) && (!min || ancho >= Number(min[1]));
}
window.matchMedia = (consulta) => {
  const mql = {
    media: consulta,
    get matches() {
      return evaluar(consulta, window.innerWidth);
    },
    addEventListener: (_t, fn) => oyentes.add(fn),
    removeEventListener: (_t, fn) => oyentes.delete(fn),
    addListener: (fn) => oyentes.add(fn),
    removeListener: (fn) => oyentes.delete(fn)
  };
  return mql;
};

/** Cambia el ancho de la ventana y notifica a las media queries, como al girar una tableta. */
globalThis.cambiarAncho = (ancho) => {
  window.innerWidth = ancho;
  oyentes.forEach((fn) => fn());
};

beforeEach(() => {
  window.innerWidth = 1280;
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
