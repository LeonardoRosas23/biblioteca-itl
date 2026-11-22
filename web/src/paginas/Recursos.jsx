import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { recursos } from '../api/servicios';
import { Estado, MensajeError, Paginacion } from '../componentes/comunes';
import { useConsulta } from '../hooks/useConsulta';

const TAMANO = 10;

export default function Recursos() {
  const { state } = useLocation();
  const [texto, setTexto] = useState('');
  const [filtros, setFiltros] = useState({ titulo: '', categoria: '', estado: '', pagina: 1 });
  const cats = useConsulta(() => recursos.categorias(), []);
  const { datos, error, cargando } = useConsulta(
    () => recursos.listar({ ...filtros, tamano: TAMANO }),
    [filtros.titulo, filtros.categoria, filtros.estado, filtros.pagina]
  );

  const cambiar = (campo, valor) => setFiltros((f) => ({ ...f, [campo]: valor, pagina: 1 }));

  return (
    <section aria-labelledby="titulo-recursos">
      <div className="encabezado">
        <h1 id="titulo-recursos">Recursos</h1>
        <Link className="boton boton--primario" to="/recursos/nuevo">
          Agregar recurso
        </Link>
      </div>

      <form
        className="filtros"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          cambiar('titulo', texto.trim());
        }}
      >
        <label className="filtros__busqueda">
          <span className="oculto">Buscar por título o código</span>
          <input type="search" placeholder="Buscar por título o código" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </label>
        <label>
          <span className="oculto">Categoría</span>
          <select value={filtros.categoria} onChange={(e) => cambiar('categoria', e.target.value)} aria-label="Categoría">
            <option value="">Todas las categorías</option>
            {(cats.datos || []).map((c) => (
              <option key={c.codigo} value={c.codigo}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="oculto">Estado</span>
          <select value={filtros.estado} onChange={(e) => cambiar('estado', e.target.value)} aria-label="Estado">
            <option value="">Todos los estados</option>
            <option value="DISPONIBLE">Disponible</option>
            <option value="RESERVADO">Reservado</option>
            <option value="PRESTADO">Prestado</option>
            <option value="MANTENIMIENTO">En mantenimiento</option>
            <option value="SIN_EXISTENCIAS">Sin existencias</option>
            <option value="INACTIVO">No disponible</option>
          </select>
        </label>
        <button type="submit" className="boton">
          Buscar
        </button>
      </form>

      {state?.aviso && (
        <p className="mensaje mensaje--exito" role="status">
          {state.aviso}
        </p>
      )}
      <MensajeError error={error} />

      {!cargando && datos?.items.length === 0 && (
        <div className="vacio">
          <p>No se encontraron recursos con esos filtros.</p>
          <button
            type="button"
            className="boton"
            onClick={() => {
              setTexto('');
              setFiltros({ titulo: '', categoria: '', estado: '', pagina: 1 });
            }}
          >
            Limpiar filtros
          </button>
        </div>
      )}

      {datos?.items.length > 0 && (
        <>
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Código</th>
                <th scope="col">Recurso</th>
                <th scope="col">Categoría</th>
                <th scope="col">Estado</th>
                <th scope="col" className="num">
                  Disponibles
                </th>
                <th scope="col">
                  <span className="oculto">Acción</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {datos.items.map((r) => (
                <tr key={r.idRecurso}>
                  <td data-titulo="Código" className="folio">
                    {r.idRecurso}
                  </td>
                  <td data-titulo="Recurso">
                    <strong>{r.titulo}</strong>
                    <span className="secundario">{r.ubicacion}</span>
                  </td>
                  <td data-titulo="Categoría">{(cats.datos || []).find((c) => c.codigo === r.categoria)?.nombre || r.categoria}</td>
                  <td data-titulo="Estado">
                    <Estado valor={r.estado} />
                  </td>
                  <td data-titulo="Disponibles" className="num">
                    {r.disponibles} / {r.existencias}
                  </td>
                  <td>
                    <Link to={`/recursos/${r.idRecurso}/editar`} aria-label={`Editar ${r.titulo}`}>
                      Editar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Paginacion pagina={datos.pagina} tamano={TAMANO} total={datos.total} alCambiar={(p) => setFiltros((f) => ({ ...f, pagina: p }))} />
        </>
      )}
    </section>
  );
}
