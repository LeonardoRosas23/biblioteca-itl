import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, cargarServidor, configurarCliente } from '../api/cliente';

// Sesión de la app móvil:
// - El token vive en el almacén seguro del sistema (Keychain en iOS, Keystore en Android), no en texto plano.
// - Se restaura al abrir la app si no ha expirado; se cierra sola al expirar o ante un 401.
// - Solo alumnos y profesores usan la app; el personal usa el panel web.

export const CLAVE = 'biblio.app.sesion';
export const ROLES_APP = ['ALUMNO', 'PROFESOR'];
export const MENSAJE_EXPIRO = 'Tu sesión expiró. Inicia sesión de nuevo.';

const Contexto = createContext(null);

// Debe ser una referencia estable: si se creara en cada render, los efectos que dependen de ella
// se volverían a ejecutar en cada render.
const relojSistema = () => Date.now();

export function SesionProvider({ children, reloj = relojSistema }) {
  const [estado, setEstado] = useState({ cargando: true, sesion: null });
  const [motivoCierre, setMotivoCierre] = useState(null);
  const ref = useRef(null);
  ref.current = estado.sesion;

  const cerrarSesion = useCallback(async (motivo = null) => {
    await SecureStore.deleteItemAsync(CLAVE);
    setMotivoCierre(motivo);
    setEstado({ cargando: false, sesion: null });
  }, []);

  configurarCliente({ token: () => ref.current?.token ?? null, noAutorizado: () => cerrarSesion(MENSAJE_EXPIRO) });

  // Restaurar al abrir la app
  useEffect(() => {
    let vigente = true;
    cargarServidor()
      .then(() => SecureStore.getItemAsync(CLAVE))
      .then((txt) => {
        const s = txt ? JSON.parse(txt) : null;
        if (s && s.expiraEnMs > reloj()) return s;
        if (s) SecureStore.deleteItemAsync(CLAVE);
        return null;
      })
      .catch(() => null)
      .then((s) => vigente && setEstado({ cargando: false, sesion: s }));
    return () => {
      vigente = false;
    };
  }, [reloj]);

  // Cierre automático al expirar el token
  useEffect(() => {
    if (!estado.sesion) return undefined;
    const t = setTimeout(() => cerrarSesion(MENSAJE_EXPIRO), Math.max(0, estado.sesion.expiraEnMs - reloj()));
    return () => clearTimeout(t);
  }, [estado.sesion, cerrarSesion, reloj]);

  const iniciarSesion = useCallback(
    async (correo, password) => {
      const r = await api.login(correo, password);
      if (!ROLES_APP.includes(r.usuario.rol)) {
        throw new Error('Esta app es para alumnos y profesores. El personal de biblioteca usa el panel web.');
      }
      const s = { token: r.token, usuario: r.usuario, expiraEnMs: reloj() + r.expiraEn * 1000 };
      await SecureStore.setItemAsync(CLAVE, JSON.stringify(s));
      setMotivoCierre(null);
      setEstado({ cargando: false, sesion: s });
    },
    [reloj]
  );

  const valor = useMemo(
    () => ({ ...estado, usuario: estado.sesion?.usuario ?? null, iniciarSesion, cerrarSesion, motivoCierre }),
    [estado, iniciarSesion, cerrarSesion, motivoCierre]
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export const useSesion = () => useContext(Contexto);
