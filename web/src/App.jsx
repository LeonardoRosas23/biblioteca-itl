import { Link, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './componentes/Layout';
import FormRecurso from './paginas/FormRecurso';
import Login from './paginas/Login';
import Multas from './paginas/Multas';
import Prestamos from './paginas/Prestamos';
import Recursos from './paginas/Recursos';
import Usuarios from './paginas/Usuarios';
import RutaProtegida from './rutas/RutaProtegida';

function NoEncontrada() {
  return (
    <main className="pagina-aviso">
      <h1>Esta página no existe</h1>
      <p>
        Revisa la dirección o vuelve a <Link to="/prestamos">Préstamos y devoluciones</Link>.
      </p>
    </main>
  );
}

/** Mapa de navegación del panel (figura 7.1). */
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RutaProtegida />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/prestamos" replace />} />
          <Route path="/recursos" element={<Recursos />} />
          <Route path="/recursos/nuevo" element={<FormRecurso />} />
          <Route path="/recursos/:id/editar" element={<FormRecurso />} />
          <Route path="/prestamos" element={<Prestamos />} />
          <Route path="/multas" element={<Multas />} />
          <Route element={<RutaProtegida roles={['ADMIN']} />}>
            <Route path="/usuarios" element={<Usuarios />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<NoEncontrada />} />
    </Routes>
  );
}
