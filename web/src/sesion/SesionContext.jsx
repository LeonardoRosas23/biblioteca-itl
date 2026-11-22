import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { configurarCliente } from '../api/cliente';
import { auth } from '../api/servicios';

// Manejo de sesión del panel:
// - El token se guarda en sessionStorage: sobrevive a recargar la página pero se borra al cerrar la pestaña.
// - La sesión se cierra sola al llegar la expiración del JWT o ante cualquier 401 del servidor.
// - Solo el personal (BIBLIOTECARIO, ADMIN) entra al panel; alumnos y profesores usan la app móvil.

export const CLAVE = 'biblio.panel.sesion';
export const ROLES_PANEL = ['BIBLIOTECARIO', 'ADMIN'];

const SesionContext = createContext(null);

// Debe ser una referencia estable: si se creara en cada render, los efectos que dependen de ella
// se volverían a ejecutar en cada render.
const relojSistema = () => Date.now();

function leerGuardada(ahora) {
  try {
    const s = JSON.parse(sessionStorage.getItem(CLAVE));
    if (s?.token && s.expiraEnMs > ahora) return s;
  } catch {
    /* sesión corrupta: se ignora */
  }
  sessionStorage.removeItem(CLAVE);
  return null;
}

export function SesionProvider({ children, reloj = relojSistema }) {
  const [sesion, setSesion] = useState(() => leerGuardada(reloj()));
  const [motivoCierre, setMotivoCierre] = useState(null);
  const sesionRef = useRef(sesion);
  sesionRef.current = sesion;

  const cerrarSesion = useCallback((motivo = null) => {
    sessionStorage.removeItem(CLAVE);
    setSesion(null);
    setMotivoCierre(motivo);
  }, []);

  const iniciarSesion = useCallback(
    async (correo, password) => {
      const r = await auth.login(correo, password);
      if (!ROLES_PANEL.includes(r.usuario.rol)) {
        const e = new Error('Este panel es para el personal de biblioteca. Alumnos y profesores usan la app móvil.');
        e.codigo = 'ROL_NO_PERMITIDO';
        throw e;
      }
      const nueva = { token: r.token, usuario: r.usuario, expiraEnMs: reloj() + r.expiraEn * 1000 };
      sessionStorage.setItem(CLAVE, JSON.stringify(nueva));
      setMotivoCierre(null);
      setSesion(nueva);
      return nueva;
    },
    [reloj]
  );

  // Conecta el cliente HTTP con el token y el cierre por 401. Se hace durante el render (no en un efecto)
  // porque React ejecuta primero los efectos de los hijos: las páginas piden datos antes que este proveedor.
  configurarCliente({
    token: () => sesionRef.current?.token ?? null,
    noAutorizado: () => cerrarSesion('Tu sesión expiró. Inicia sesión de nuevo.')
  });

  // Cierre automático al expirar el token
  useEffect(() => {
    if (!sesion) return undefined;
    const restante = sesion.expiraEnMs - reloj();
    const t = setTimeout(() => cerrarSesion('Tu sesión expiró. Inicia sesión de nuevo.'), Math.max(0, restante));
    return () => clearTimeout(t);
  }, [sesion, cerrarSesion, reloj]);

  // Cerrar sesión en una pestaña la cierra en las demás
  useEffect(() => {
    const alCambiar = (e) => {
      if (e.key === CLAVE && !e.newValue) cerrarSesion(null);
    };
    window.addEventListener('storage', alCambiar);
    return () => window.removeEventListener('storage', alCambiar);
  }, [cerrarSesion]);

  const valor = useMemo(
    () => ({ sesion, usuario: sesion?.usuario ?? null, iniciarSesion, cerrarSesion, motivoCierre }),
    [sesion, iniciarSesion, cerrarSesion, motivoCierre]
  );
  return <SesionContext.Provider value={valor}>{children}</SesionContext.Provider>;
}

export function useSesion() {
  const c = useContext(SesionContext);
  if (!c) throw new Error('useSesion debe usarse dentro de SesionProvider');
  return c;
}
