import { useCallback, useEffect, useState } from 'react';

/** Ejecuta una consulta cuando cambian sus dependencias; expone datos, error, cargando y recargar. */
export function useConsulta(fn, deps) {
  const [estado, setEstado] = useState({ datos: null, error: null, cargando: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ejecutar = useCallback(fn, deps);

  const recargar = useCallback(() => {
    let vigente = true;
    setEstado((e) => ({ ...e, cargando: true, error: null }));
    ejecutar()
      .then((datos) => vigente && setEstado({ datos, error: null, cargando: false }))
      .catch((error) => vigente && setEstado((e) => ({ ...e, error, cargando: false })));
    return () => {
      vigente = false;
    };
  }, [ejecutar]);

  useEffect(() => recargar(), [recargar]);
  return { ...estado, recargar };
}
