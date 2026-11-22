import { useEffect, useRef } from 'react';

// Sección 7.4: cada estado interno se muestra con texto claro, además del color.
export const ETIQUETAS = {
  DISPONIBLE: ['Disponible', 'ok'],
  RESERVADO: ['Reservado', 'info'],
  PRESTADO: ['Prestado', 'info'],
  MANTENIMIENTO: ['En mantenimiento', 'aviso'],
  SIN_EXISTENCIAS: ['Sin existencias', 'neutro'],
  INACTIVO: ['No disponible', 'neutro'],
  PENDIENTE_ENTREGA: ['Pendiente de recoger', 'pendiente'],
  ACTIVO: ['Activo', 'ok'],
  VENCIDO: ['Vencido', 'peligro'],
  FINALIZADO: ['Devuelto', 'neutro'],
  RECHAZADO: ['Rechazado', 'neutro'],
  PENDIENTE: ['Pendiente de pago', 'peligro'],
  PAGADA: ['Pagada', 'ok'],
  CANCELADA: ['Cancelada', 'neutro']
};

export function Estado({ valor }) {
  const [texto, tono] = ETIQUETAS[valor] || [valor, 'neutro'];
  return <span className={`estado estado--${tono}`}>{texto}</span>;
}

const FECHA = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Mexico_City' });

/** Acepta '2026-10-16' (fecha sin hora) o un instante ISO. */
export function fecha(valor) {
  if (!valor) return '—';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(valor) ? new Date(`${valor}T12:00:00-06:00`) : new Date(valor);
  return FECHA.format(d).replace('.', '');
}

export const pesos = (n) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n || 0));

export function MensajeError({ error }) {
  if (!error) return null;
  return (
    <p className="mensaje mensaje--error" role="alert">
      {error.message || String(error)}
    </p>
  );
}

export function Paginacion({ pagina, tamano, total, alCambiar }) {
  const paginas = Math.max(1, Math.ceil(total / tamano));
  const desde = total === 0 ? 0 : (pagina - 1) * tamano + 1;
  const hasta = Math.min(total, pagina * tamano);
  return (
    <nav className="paginacion" aria-label="Paginación">
      <span>
        {desde}–{hasta} de {total}
      </span>
      <button type="button" onClick={() => alCambiar(pagina - 1)} disabled={pagina <= 1} aria-label="Página anterior">
        ‹
      </button>
      <span aria-current="page">
        {pagina} / {paginas}
      </span>
      <button type="button" onClick={() => alCambiar(pagina + 1)} disabled={pagina >= paginas} aria-label="Página siguiente">
        ›
      </button>
    </nav>
  );
}

/** Diálogo modal accesible: foco inicial, Escape para cerrar y fondo inerte. */
export function Dialogo({ titulo, children, alCerrar, acciones }) {
  const ref = useRef(null);
  useEffect(() => {
    const previo = document.activeElement;
    ref.current?.focus();
    const tecla = (e) => e.key === 'Escape' && alCerrar();
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('keydown', tecla);
      previo?.focus?.();
    };
  }, [alCerrar]);
  return (
    <div className="dialogo-fondo" onMouseDown={(e) => e.target === e.currentTarget && alCerrar()}>
      <div className="dialogo" role="dialog" aria-modal="true" aria-labelledby="dialogo-titulo" tabIndex={-1} ref={ref}>
        <h2 id="dialogo-titulo">{titulo}</h2>
        {children}
        <div className="dialogo__acciones">{acciones}</div>
      </div>
    </div>
  );
}
