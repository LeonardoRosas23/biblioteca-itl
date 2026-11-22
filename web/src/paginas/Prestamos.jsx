import { useState } from 'react';
import { prestamos } from '../api/servicios';
import { Dialogo, Estado, MensajeError, Paginacion, fecha, pesos } from '../componentes/comunes';
import { useConsulta } from '../hooks/useConsulta';

const TAMANO = 10;
const DIA = 86_400_000;

/** Días de retraso que vería hoy el mostrador (la cifra oficial la calcula Préstamos). */
export function diasDeRetraso(fechaLimite, hoy = new Date()) {
  const limite = new Date(`${fechaLimite}T23:59:59-06:00`);
  return Math.max(0, Math.ceil((hoy - limite) / DIA));
}

/** CU04 y CU05: localizar el préstamo, aprobar la entrega y registrar la devolución. */
export default function Prestamos() {
  const [texto, setTexto] = useState('');
  const [filtros, setFiltros] = useState({ folio: '', idUsuario: '', estado: '', pagina: 1 });
  const [aprobar, setAprobar] = useState(null);
  const [devolver, setDevolver] = useState(null);
  const [danado, setDanado] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [errorAccion, setErrorAccion] = useState(null);
  const [trabajando, setTrabajando] = useState(false);

  const { datos, error, recargar } = useConsulta(
    () => prestamos.listar({ ...filtros, tamano: TAMANO }),
    [filtros.folio, filtros.idUsuario, filtros.estado, filtros.pagina]
  );

  function buscar(e) {
    e.preventDefault();
    const t = texto.trim().toUpperCase();
    // "P-0101" busca por folio; "U123" por usuario
    setFiltros((f) => ({ ...f, folio: t.startsWith('P-') ? t : '', idUsuario: t.startsWith('U') ? t : '', pagina: 1 }));
  }

  async function ejecutar(accion) {
    setTrabajando(true);
    setErrorAccion(null);
    try {
      await accion();
      recargar();
    } catch (err) {
      setErrorAccion(err);
      recargar();
    } finally {
      setTrabajando(false);
    }
  }

  const cerrar = () => {
    setAprobar(null);
    setDevolver(null);
    setDanado(false);
    setErrorAccion(null);
  };

  return (
    <section aria-labelledby="titulo-prestamos">
      <div className="encabezado">
        <h1 id="titulo-prestamos">Préstamos y devoluciones</h1>
      </div>

      <form className="filtros" role="search" onSubmit={buscar}>
        <label className="filtros__busqueda">
          <span className="oculto">Buscar por usuario o folio</span>
          <input type="search" placeholder="Folio (P-0101) o usuario (U123)" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </label>
        <select
          aria-label="Estado"
          value={filtros.estado}
          onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value, pagina: 1 }))}
        >
          <option value="">Todos los estados</option>
          <option value="PENDIENTE_ENTREGA">Pendiente de recoger</option>
          <option value="ACTIVO">Activo</option>
          <option value="VENCIDO">Vencido</option>
          <option value="FINALIZADO">Devuelto</option>
          <option value="RECHAZADO">Rechazado</option>
        </select>
        <button type="submit" className="boton">
          Buscar
        </button>
      </form>

      {resultado && (
        <p className="mensaje mensaje--exito" role="status">
          {resultado}
        </p>
      )}
      <MensajeError error={error} />

      {datos?.items.length === 0 && (
        <div className="vacio">
          <p>No hay préstamos que coincidan con la búsqueda.</p>
        </div>
      )}

      {datos?.items.length > 0 && (
        <>
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Folio</th>
                <th scope="col">Usuario</th>
                <th scope="col">Recurso</th>
                <th scope="col">Estado</th>
                <th scope="col">Fecha límite</th>
                <th scope="col">
                  <span className="oculto">Acción</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {datos.items.map((p) => (
                <tr key={p.idPrestamo}>
                  <td data-titulo="Folio" className="folio">
                    {p.idPrestamo}
                  </td>
                  <td data-titulo="Usuario">{p.idUsuario}</td>
                  <td data-titulo="Recurso">{p.tituloRecurso}</td>
                  <td data-titulo="Estado">
                    <Estado valor={p.estado} />
                    {p.estado === 'VENCIDO' && <span className="secundario">{diasDeRetraso(p.fechaDevolucionEstimada)} días</span>}
                  </td>
                  <td data-titulo="Fecha límite">
                    {p.estado === 'PENDIENTE_ENTREGA' ? `Recoger antes del ${fecha(p.reservaVigenteHasta)}` : fecha(p.fechaDevolucionEstimada)}
                  </td>
                  <td>
                    {p.estado === 'PENDIENTE_ENTREGA' && (
                      <button type="button" className="boton boton--chico" onClick={() => setAprobar(p)}>
                        Aprobar entrega
                      </button>
                    )}
                    {(p.estado === 'ACTIVO' || p.estado === 'VENCIDO') && (
                      <button type="button" className="boton boton--chico" onClick={() => setDevolver(p)}>
                        Registrar devolución
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

      {aprobar && (
        <Dialogo
          titulo={`Aprobar entrega · ${aprobar.idPrestamo}`}
          alCerrar={cerrar}
          acciones={
            <>
              <button type="button" className="boton" onClick={cerrar}>
                Cancelar
              </button>
              <button
                type="button"
                className="boton boton--primario"
                disabled={trabajando}
                onClick={() =>
                  ejecutar(async () => {
                    const r = await prestamos.aprobar(aprobar.idPrestamo);
                    setResultado(`Entrega aprobada. ${r.tituloRecurso} vence el ${fecha(r.fechaDevolucionEstimada)}.`);
                    cerrar();
                  })
                }
              >
                Aprobar entrega
              </button>
            </>
          }
        >
          <p>
            Verifica la identidad de <strong>{aprobar.idUsuario}</strong> y entrega <strong>{aprobar.tituloRecurso}</strong>.
          </p>
          <MensajeError error={errorAccion} />
        </Dialogo>
      )}

      {devolver && (
        <Dialogo
          titulo={`Devolución · ${devolver.idPrestamo}`}
          alCerrar={cerrar}
          acciones={
            <>
              <button type="button" className="boton" onClick={cerrar}>
                Cancelar
              </button>
              <button
                type="button"
                className="boton boton--primario"
                disabled={trabajando}
                onClick={() =>
                  ejecutar(async () => {
                    const r = await prestamos.devolver(devolver.idPrestamo, danado);
                    setResultado(
                      r.multa
                        ? `Devolución registrada con ${r.diasRetraso} días de retraso. Multa ${r.multa.idMulta} de ${pesos(r.multa.montoCalculado)}.`
                        : 'Devolución registrada a tiempo, sin multa.'
                    );
                    cerrar();
                  })
                }
              >
                Confirmar devolución
              </button>
            </>
          }
        >
          <TarjetaDevolucion prestamo={devolver} />
          <label className="casilla">
            <input type="checkbox" checked={danado} onChange={(e) => setDanado(e.target.checked)} />
            El recurso presenta daños (enviar a mantenimiento)
          </label>
          <MensajeError error={errorAccion} />
        </Dialogo>
      )}
    </section>
  );
}

/** Resumen con la forma de la tarjeta de fechas de un libro de biblioteca. */
function TarjetaDevolucion({ prestamo, tarifa = 10 }) {
  const dias = diasDeRetraso(prestamo.fechaDevolucionEstimada);
  return (
    <div className="ficha" aria-label="Resumen de la devolución">
      <p className="ficha__recurso">{prestamo.tituloRecurso}</p>
      <dl className="ficha__renglones">
        <div>
          <dt>Fecha límite</dt>
          <dd>{fecha(prestamo.fechaDevolucionEstimada)}</dd>
        </div>
        <div>
          <dt>Se devuelve</dt>
          <dd>{fecha(new Date().toISOString())}</dd>
        </div>
        <div>
          <dt>Días de retraso</dt>
          <dd>{dias}</dd>
        </div>
      </dl>
      {dias > 0 ? (
        <p className="ficha__sello">
          Multa estimada {pesos(dias * tarifa)}
          <span>tarifa de ejemplo {pesos(tarifa)} por día</span>
        </p>
      ) : (
        <p className="ficha__sello ficha__sello--ok">A tiempo</p>
      )}
    </div>
  );
}
