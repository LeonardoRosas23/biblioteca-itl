import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { recursos } from '../api/servicios';
import { Estado, MensajeError } from '../componentes/comunes';
import { useConsulta } from '../hooks/useConsulta';

const VACIO = { titulo: '', categoria: '', ubicacion: '', existencias: '1', estado: 'DISPONIBLE', descripcion: '' };

/** Validación previa al envío (sección 7.5): cada campo obligatorio dice qué falta. */
export function validarRecurso(d) {
  const e = {};
  if (!d.titulo.trim()) e.titulo = 'Escribe el título del recurso.';
  else if (d.titulo.trim().length > 200) e.titulo = 'El título admite como máximo 200 caracteres.';
  if (!d.categoria) e.categoria = 'Elige una categoría.';
  if (!d.ubicacion.trim()) e.ubicacion = 'Indica dónde se encuentra (p. ej. Estante B-12).';
  const n = Number(d.existencias);
  if (d.existencias === '' || !Number.isInteger(n) || n < 0 || n > 9999) {
    e.existencias = 'Usa un número entero entre 0 y 9999.';
  }
  return e;
}

export default function FormRecurso() {
  const { id } = useParams();
  const editando = Boolean(id);
  const navegar = useNavigate();
  const cats = useConsulta(() => recursos.categorias(), []);
  const [datos, setDatos] = useState(VACIO);
  const [errores, setErrores] = useState({});
  const [errorServidor, setErrorServidor] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [cargando, setCargando] = useState(editando);

  useEffect(() => {
    if (!editando) return;
    recursos
      .obtener(id)
      .then((r) =>
        setDatos({
          titulo: r.titulo,
          categoria: r.categoria,
          ubicacion: r.ubicacion,
          existencias: String(r.existencias),
          estado: r.estado,
          descripcion: r.descripcion || ''
        })
      )
      .catch(setErrorServidor)
      .finally(() => setCargando(false));
  }, [editando, id]);

  const campo = (nombre) => ({
    id: nombre,
    value: datos[nombre],
    onChange: (e) => setDatos((d) => ({ ...d, [nombre]: e.target.value })),
    'aria-invalid': Boolean(errores[nombre]),
    'aria-describedby': errores[nombre] ? `${nombre}-error` : undefined
  });

  async function guardar(e) {
    e.preventDefault();
    const val = validarRecurso(datos);
    setErrores(val);
    if (Object.keys(val).length) {
      document.getElementById(Object.keys(val)[0])?.focus();
      return;
    }
    setGuardando(true);
    setErrorServidor(null);
    const cuerpo = {
      titulo: datos.titulo.trim(),
      categoria: datos.categoria,
      ubicacion: datos.ubicacion.trim(),
      existencias: Number(datos.existencias),
      descripcion: datos.descripcion.trim() || null
    };
    try {
      if (editando) await recursos.modificar(id, cuerpo);
      else await recursos.crear({ ...cuerpo, estado: datos.estado });
      navegar('/recursos', { state: { aviso: editando ? 'Cambios guardados.' : 'Recurso agregado.' } });
    } catch (err) {
      setErrorServidor(err);
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarEstado(estado, aviso) {
    setErrorServidor(null);
    try {
      if (estado === 'REPARAR') await recursos.reparar(id);
      else await recursos.cambiarEstado(id, estado);
      navegar('/recursos', { state: { aviso } });
    } catch (err) {
      setErrorServidor(err);
    }
  }

  const error = (n) =>
    errores[n] && (
      <span id={`${n}-error`} className="campo__error">
        {errores[n]}
      </span>
    );

  if (cargando) return <p>Cargando recurso…</p>;

  return (
    <section aria-labelledby="titulo-form">
      <p className="migas">
        <Link to="/recursos">Recursos</Link> / {editando ? id : 'Nuevo'}
      </p>
      <h1 id="titulo-form">{editando ? 'Editar recurso' : 'Agregar recurso'}</h1>
      <form className="formulario" onSubmit={guardar} noValidate>
        <div className="campo campo--ancho">
          <label htmlFor="titulo">Título *</label>
          <input type="text" placeholder="Ej. Laptop Lenovo ThinkPad" {...campo('titulo')} />
          {error('titulo')}
        </div>
        <div className="campo">
          <label htmlFor="categoria">Categoría *</label>
          <select {...campo('categoria')}>
            <option value="">Seleccionar categoría</option>
            {(cats.datos || []).map((c) => (
              <option key={c.codigo} value={c.codigo}>
                {c.nombre}
              </option>
            ))}
          </select>
          {error('categoria')}
        </div>
        <div className="campo">
          <label htmlFor="ubicacion">Ubicación *</label>
          <input type="text" placeholder="Ej. Mostrador, Estante B-12" {...campo('ubicacion')} />
          {error('ubicacion')}
        </div>
        <div className="campo">
          <label htmlFor="existencias">Existencias *</label>
          <input type="number" min="0" max="9999" inputMode="numeric" {...campo('existencias')} />
          {error('existencias')}
        </div>
        {!editando && (
          <div className="campo">
            <label htmlFor="estado">Estado inicial</label>
            <select {...campo('estado')}>
              <option value="DISPONIBLE">Disponible</option>
              <option value="MANTENIMIENTO">En mantenimiento</option>
            </select>
          </div>
        )}
        <div className="campo campo--ancho">
          <label htmlFor="descripcion">Descripción (opcional)</label>
          <textarea rows="3" {...campo('descripcion')} />
        </div>
        <p className="nota campo--ancho">* Campos obligatorios.</p>
        <MensajeError error={errorServidor} />
        <div className="formulario__acciones campo--ancho">
          <Link className="boton" to="/recursos">
            Cancelar
          </Link>
          <button type="submit" className="boton boton--primario" disabled={guardando}>
            {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Agregar recurso'}
          </button>
        </div>
      </form>
      {editando && (
        <div className="zona-estado" aria-labelledby="titulo-estado">
          <h2 id="titulo-estado">Estado del recurso</h2>
          <p>
            Estado actual: <Estado valor={datos.estado} />. Un recurso reservado o prestado no se puede dar de baja hasta que se devuelva.
          </p>
          <div className="formulario__acciones">
            {datos.estado !== 'MANTENIMIENTO' && (
              <button type="button" className="boton" onClick={() => cambiarEstado('MANTENIMIENTO', 'Recurso enviado a mantenimiento.')}>
                Enviar a mantenimiento
              </button>
            )}
            {(datos.estado === 'MANTENIMIENTO' || datos.estado === 'INACTIVO') && (
              <button type="button" className="boton" onClick={() => cambiarEstado('DISPONIBLE', 'Recurso reactivado.')}>
                Reactivar
              </button>
            )}
            {datos.estado !== 'INACTIVO' && (
              <button type="button" className="boton boton--peligro" onClick={() => cambiarEstado('INACTIVO', 'Recurso dado de baja.')}>
                Dar de baja
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
