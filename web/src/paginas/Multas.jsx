import { useState } from 'react';
import { multas } from '../api/servicios';
import { Dialogo, Estado, MensajeError, Paginacion, fecha, pesos } from '../componentes/comunes';
import { useConsulta } from '../hooks/useConsulta';

const TAMANO = 10;

export default function Multas() {
  const [filtros, setFiltros] = useState({ idUsuario: '', estadoPago: 'PENDIENTE', pagina: 1 });
  const [texto, setTexto] = useState('');
  const [seleccion, setSeleccion] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [errorAccion, setErrorAccion] = useState(null);
  const { datos, error, recargar } = useConsulta(
    () => multas.listar({ ...filtros, tamano: TAMANO }),
    [filtros.idUsuario, filtros.estadoPago, filtros.pagina]
  );

  async function resolver(estadoPago) {
    setErrorAccion(null);
    try {
      await multas.resolver(seleccion.idMulta, estadoPago);
      setAviso(estadoPago === 'PAGADA' ? `Pago registrado para ${seleccion.idMulta}.` : `Multa ${seleccion.idMulta} cancelada.`);
      setSeleccion(null);
      recargar();
    } catch (e) {
      setErrorAccion(e);
    }
  }

  return (
    <section aria-labelledby="titulo-multas">
      <div className="encabezado">
        <h1 id="titulo-multas">Multas</h1>
      </div>
      <form
        className="filtros"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setFiltros((f) => ({ ...f, idUsuario: texto.trim().toUpperCase(), pagina: 1 }));
        }}
      >
        <label className="filtros__busqueda">
          <span className="oculto">Buscar por usuario</span>
          <input type="search" placeholder="Usuario (U123)" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </label>
        <select
          aria-label="Estado de pago"
          value={filtros.estadoPago}
          onChange={(e) => setFiltros((f) => ({ ...f, estadoPago: e.target.value, pagina: 1 }))}
        >
          <option value="">Todas</option>
          <option value="PENDIENTE">Pendientes de pago</option>
          <option value="PAGADA">Pagadas</option>
          <option value="CANCELADA">Canceladas</option>
        </select>
        <button type="submit" className="boton">
          Buscar
        </button>
      </form>
      {aviso && (
        <p className="mensaje mensaje--exito" role="status">
          {aviso}
        </p>
      )}
      <MensajeError error={error} />
      {datos?.items.length === 0 && (
        <div className="vacio">
          <p>No hay multas con esos filtros.</p>
        </div>
      )}
      {datos?.items.length > 0 && (
        <>
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Multa</th>
                <th scope="col">Usuario</th>
                <th scope="col">Préstamo</th>
                <th scope="col" className="num">
                  Días
                </th>
                <th scope="col" className="num">
                  Monto
                </th>
                <th scope="col">Estado</th>
                <th scope="col">Generada</th>
                <th scope="col">
                  <span className="oculto">Acción</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {datos.items.map((m) => (
                <tr key={m.idMulta}>
                  <td data-titulo="Multa" className="folio">
                    {m.idMulta}
                  </td>
                  <td data-titulo="Usuario">{m.idUsuario}</td>
                  <td data-titulo="Préstamo" className="folio">
                    {m.idPrestamo}
                  </td>
                  <td data-titulo="Días" className="num">
                    {m.diasRetraso}
                  </td>
                  <td data-titulo="Monto" className="num">
                    {pesos(m.montoCalculado)}
                  </td>
                  <td data-titulo="Estado">
                    <Estado valor={m.estadoPago} />
                  </td>
                  <td data-titulo="Generada">{fecha(m.fechaGeneracion)}</td>
                  <td>
                    {m.estadoPago === 'PENDIENTE' && (
                      <button type="button" className="boton boton--chico" onClick={() => setSeleccion(m)}>
                        Registrar pago
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Paginacion pagina={datos.pagina} tamano={TAMANO} total={datos.total} alCambiar={(n) => setFiltros((f) => ({ ...f, pagina: n }))} />
        </>
      )}
      {seleccion && (
        <Dialogo
          titulo={`Multa ${seleccion.idMulta}`}
          alCerrar={() => setSeleccion(null)}
          acciones={
            <>
              <button type="button" className="boton" onClick={() => resolver('CANCELADA')}>
                Cancelar multa
              </button>
              <button type="button" className="boton boton--primario" onClick={() => resolver('PAGADA')}>
                Registrar pago
              </button>
            </>
          }
        >
          <p>
            {seleccion.idUsuario} debe {pesos(seleccion.montoCalculado)} por {seleccion.diasRetraso} días de retraso en {seleccion.idPrestamo}.
          </p>
          <MensajeError error={errorAccion} />
        </Dialogo>
      )}
    </section>
  );
}
