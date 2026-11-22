import { useCallback, useEffect, useState } from 'react';

/** Carga datos al montar y permite refrescar (gesto de "jalar para actualizar"). */
export function useCarga(fn, deps) {
  const [estado, setEstado] = useState({ datos: null, error: null, cargando: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cargar = useCallback(async () => {
    setEstado((e) => ({ ...e, cargando: true, error: null }));
    try {
      setEstado({ datos: await fn(), error: null, cargando: false });
    } catch (error) {
      setEstado((e) => ({ ...e, error, cargando: false }));
    }
  }, deps);
  useEffect(() => {
    cargar();
  }, [cargar]);
  return { ...estado, recargar: cargar };
}
