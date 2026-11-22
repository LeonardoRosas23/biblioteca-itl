import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { CONSULTA_ANGOSTA, useMediaQuery } from '../hooks/useMediaQuery';
import { useSesion } from '../sesion/SesionContext';

const SECCIONES = [
  { a: '/recursos', texto: 'Recursos' },
  { a: '/prestamos', texto: 'Préstamos y devoluciones' },
  { a: '/multas', texto: 'Multas' },
  { a: '/usuarios', texto: 'Usuarios', soloAdmin: true }
];

export default function Layout() {
  const { usuario, cerrarSesion } = useSesion();
  const angosta = useMediaQuery(CONSULTA_ANGOSTA);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const { pathname } = useLocation();

  // Al navegar o al volver a pantalla ancha, el menú desplegable se cierra
  useEffect(() => setMenuAbierto(false), [pathname, angosta]);
  useEffect(() => {
    if (!menuAbierto) return undefined;
    const tecla = (e) => e.key === 'Escape' && setMenuAbierto(false);
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [menuAbierto]);

  const menuVisible = !angosta || menuAbierto;

  return (
    <div className={`marco ${angosta ? 'marco--angosto' : ''}`}>
      <header className="barra">
        {angosta && (
          <button
            type="button"
            className="barra__menu"
            aria-expanded={menuAbierto}
            aria-controls="menu-principal"
            onClick={() => setMenuAbierto((v) => !v)}
          >
            {menuAbierto ? 'Cerrar menú' : 'Menú'}
          </button>
        )}
        <span className="barra__marca">Biblioteca ITL</span>
        <span className="barra__usuario">
          <span className="barra__nombre">{usuario.nombre || usuario.correo}</span>
          <button type="button" className="enlace" onClick={() => cerrarSesion(null)}>
            Cerrar sesión
          </button>
        </span>
      </header>

      {menuVisible && (
        <nav id="menu-principal" className={`menu ${angosta ? 'menu--desplegable' : ''}`} aria-label="Secciones del panel">
          <ul>
            {SECCIONES.filter((s) => !s.soloAdmin || usuario.rol === 'ADMIN').map((s) => (
              <li key={s.a}>
                <NavLink to={s.a}>{s.texto}</NavLink>
              </li>
            ))}
          </ul>
          <p className="menu__rol">{usuario.rol === 'ADMIN' ? 'Administrador' : 'Bibliotecario'}</p>
        </nav>
      )}

      <main className="contenido" id="contenido">
        <Outlet />
      </main>
    </div>
  );
}
