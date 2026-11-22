import { useEffect, useState } from 'react';

/** Devuelve true mientras la consulta de medios se cumpla y se actualiza al redimensionar. */
export function useMediaQuery(consulta) {
  const evaluar = () => (typeof window.matchMedia === 'function' ? window.matchMedia(consulta).matches : false);
  const [coincide, setCoincide] = useState(evaluar);
  useEffect(() => {
    const mql = window.matchMedia(consulta);
    const alCambiar = () => setCoincide(mql.matches);
    alCambiar();
    mql.addEventListener('change', alCambiar);
    return () => mql.removeEventListener('change', alCambiar);
  }, [consulta]);
  return coincide;
}

export const CONSULTA_ANGOSTA = '(max-width: 899px)';
