import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ROLES_PANEL, useSesion } from '../sesion/SesionContext';

/** Sin sesión → /login recordando a dónde quería ir; con un rol que no es del panel → aviso. */
export default function RutaProtegida({ roles = ROLES_PANEL }) {
  const { sesion } = useSesion();
  const ubicacion = useLocation();
  if (!sesion) {
    return <Navigate to="/login" replace state={{ desde: ubicacion.pathname + ubicacion.search }} />;
  }
  if (!roles.includes(sesion.usuario.rol)) {
    return (
      <main className="pagina-aviso">
        <h1>No tienes acceso a esta sección</h1>
        <p>Tu cuenta no tiene permisos para esta parte del panel.</p>
      </main>
    );
  }
  return <Outlet />;
}
