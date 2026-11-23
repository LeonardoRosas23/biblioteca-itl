import { useState } from 'react';
import { usuarios } from '../api/servicios';
import { Dialogo, MensajeError, Paginacion, fecha } from '../componentes/comunes';
import { useConsulta } from '../hooks/useConsulta';
import { useSesion } from '../sesion/SesionContext';
import { errorPassword, revisarPassword } from '../politicaPassword';

// Administración de cuentas (sección 5.7: solo ADMIN bloquea cuentas y asigna roles; RN10).

const TAMANO = 10;

export const ROLES = [
  ['ALUMNO', 'Alumno'],
  ['PROFESOR', 'Profesor'],
  ['BIBLIOTECARIO', 'Bibliotecario'],
  ['ADMIN', 'Administrador']
];
const NOMBRE_ROL = Object.fromEntries(ROLES);

export const ESTADOS_CUENTA = {
  ACTIVO: ['Activa', 'ok'],
  BLOQUEADO: ['Bloqueada', 'peligro'],
  INACTIVO: ['Inactiva', 'neutro']
};

function EstadoCuenta({ valor }) {
  const [texto, tono] = ESTADOS_CUENTA[valor] || [valor, 'neutro'];
  return <span className={`estado estado--${tono}`}>{texto}</span>;
}

/** Validación del alta de personal antes de enviar (sección 7.5). Devuelve { campo: mensaje }. */
export function validarCuenta({ nombre, correo, password }) {
  const errores = {};
  if (!nombre.trim()) errores.nombre = 'Escribe el nombre completo.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim())) errores.correo = 'Escribe un correo válido (nombre@itleon.edu.mx).';
  const fallaPassword = errorPassword(password, correo.trim());
  if (fallaPassword) errores.password = fallaPassword;
  return errores;
}

function CambiarCuenta({ cuenta, esYo, alCerrar, alGuardar }) {
  const [estado, setEstado] = useState(cuenta.estado);
  const [rol, setRol] = useState(cuenta.rol);
  const [error, setError] = useState(null);
  const sinCambios = estado === cuenta.estado && rol === cuenta.rol;

  async function guardar() {
    setError(null);
    const cambios = {};
    if (estado !== cuenta.estado) cambios.estado = estado;
    if (rol !== cuenta.rol) cambios.rol = rol;
    try {
      await usuarios.cambiar(cuenta.idUsuario, cambios);
      alGuardar(`Cuenta ${cuenta.idUsuario} actualizada.`);
    } catch (e) {
      setError(e);
    }
  }

  return (
    <Dialogo
      titulo={`Cuenta ${cuenta.idUsuario}`}
      alCerrar={alCerrar}
      acciones={
        <>
          <button type="button" className="boton" onClick={alCerrar}>
            Cancelar
          </button>
          <button type="button" className="boton boton--primario" onClick={guardar} disabled={sinCambios}>
            Guardar cambios
          </button>
        </>
      }
    >
      <p>
        <strong>{cuenta.nombre}</strong> · {cuenta.correo}
      </p>
      {esYo && <p className="ayuda">Es tu propia cuenta: no puedes bloquearla ni quitarte el rol de administrador.</p>}
      <div className="campo">
        <label htmlFor="cuenta-estado">Estado de la cuenta</label>
        <select id="cuenta-estado" value={estado} onChange={(e) => setEstado(e.target.value)}>
          {Object.entries(ESTADOS_CUENTA).map(([v, [t]]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div className="campo">
        <label htmlFor="cuenta-rol">Rol</label>
        <select id="cuenta-rol" value={rol} onChange={(e) => setRol(e.target.value)}>
          {ROLES.map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </select>
      </div>
      {estado === 'BLOQUEADO' && cuenta.estado !== 'BLOQUEADO' && (
        <p className="ayuda">Al bloquearla, la persona no podrá iniciar sesión ni solicitar préstamos.</p>
      )}
      <MensajeError error={error} />
    </Dialogo>
  );
}

/** Lista en vivo de los requisitos de la contraseña (RNF06, RNF07). */
export function RequisitosPassword({ password, correo }) {
  if (!password) return null;
  return (
    <ul className="requisitos" aria-label="Requisitos de la contraseña">
      {revisarPassword(password, correo).map((r) => (
        <li key={r.id} className={r.ok ? 'requisitos__ok' : 'requisitos__falta'}>
          <span aria-hidden="true">{r.ok ? '✓' : '○'}</span> {r.texto}
          <span className="solo-lector">{r.ok ? ' (cumple)' : ' (falta)'}</span>
        </li>
      ))}
    </ul>
  );
}

function NuevaCuenta({ alCerrar, alGuardar }) {
  const [datos, setDatos] = useState({ nombre: '', correo: '', password: '', rol: 'BIBLIOTECARIO' });
  const [errores, setErrores] = useState({});
  const [error, setError] = useState(null);
  const cambiar = (campo) => (e) => setDatos((d) => ({ ...d, [campo]: e.target.value }));

  async function guardar() {
    setError(null);
    const v = validarCuenta(datos);
    setErrores(v);
    if (Object.keys(v).length) {
      document.getElementById(`cuenta-${Object.keys(v)[0]}`)?.focus();
      return;
    }
    try {
      const creada = await usuarios.crear({ ...datos, nombre: datos.nombre.trim(), correo: datos.correo.trim() });
      alGuardar(`Cuenta ${creada.idUsuario} creada para ${creada.correo}.`);
    } catch (e) {
      setError(e);
    }
  }

  const campo = (id, etiqueta, tipo = 'text') => (
    <div className="campo">
      <label htmlFor={`cuenta-${id}`}>{etiqueta} *</label>
      <input
        id={`cuenta-${id}`}
        type={tipo}
        value={datos[id]}
        onChange={cambiar(id)}
        aria-invalid={errores[id] ? 'true' : undefined}
        aria-describedby={errores[id] ? `error-${id}` : undefined}
        autoComplete={tipo === 'password' ? 'new-password' : 'off'}
      />
      {errores[id] && (
        <span className="campo__error" id={`error-${id}`}>
          {errores[id]}
        </span>
      )}
    </div>
  );

  return (
    <Dialogo
      titulo="Agregar cuenta"
      alCerrar={alCerrar}
      acciones={
        <>
          <button type="button" className="boton" onClick={alCerrar}>
            Cancelar
          </button>
          <button type="button" className="boton boton--primario" onClick={guardar}>
            Crear cuenta
          </button>
        </>
      }
    >
      {campo('nombre', 'Nombre')}
      {campo('correo', 'Correo institucional', 'email')}
      {campo('password', 'Contraseña inicial', 'password')}
      <RequisitosPassword password={datos.password} correo={datos.correo.trim()} />
      <div className="campo">
        <label htmlFor="cuenta-rol-nuevo">Rol</label>
        <select id="cuenta-rol-nuevo" value={datos.rol} onChange={cambiar('rol')}>
          {ROLES.map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <MensajeError error={error} />
    </Dialogo>
  );
}

export default function Usuarios() {
  const { usuario } = useSesion();
  const [filtros, setFiltros] = useState({ q: '', rol: '', pagina: 1 });
  const [texto, setTexto] = useState('');
  const [seleccion, setSeleccion] = useState(null);
  const [nueva, setNueva] = useState(false);
  const [aviso, setAviso] = useState(null);
  const { datos, error, recargar } = useConsulta(
    () => usuarios.listar({ ...filtros, tamano: TAMANO }),
    [filtros.q, filtros.rol, filtros.pagina]
  );

  const terminar = (mensaje) => {
    setSeleccion(null);
    setNueva(false);
    setAviso(mensaje);
    recargar();
  };

  return (
    <section aria-labelledby="titulo-usuarios">
      <div className="encabezado">
        <h1 id="titulo-usuarios">Usuarios</h1>
        <button type="button" className="boton boton--primario" onClick={() => setNueva(true)}>
          Agregar cuenta
        </button>
      </div>
      <form
        className="filtros"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setFiltros((f) => ({ ...f, q: texto.trim(), pagina: 1 }));
        }}
      >
        <label className="filtros__busqueda">
          <span className="oculto">Buscar por nombre, correo o código</span>
          <input type="search" placeholder="Nombre, correo o código (U123)" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </label>
        <select aria-label="Rol" value={filtros.rol} onChange={(e) => setFiltros((f) => ({ ...f, rol: e.target.value, pagina: 1 }))}>
          <option value="">Todos los roles</option>
          {ROLES.map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
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
          <p>No hay cuentas con esos filtros.</p>
        </div>
      )}
      {datos?.items.length > 0 && (
        <>
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Código</th>
                <th scope="col">Nombre</th>
                <th scope="col">Correo</th>
                <th scope="col">Rol</th>
                <th scope="col">Estado</th>
                <th scope="col">Registro</th>
                <th scope="col">
                  <span className="oculto">Acción</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {datos.items.map((c) => (
                <tr key={c.idUsuario}>
                  <td data-titulo="Código" className="folio">
                    {c.idUsuario}
                  </td>
                  <td data-titulo="Nombre">{c.nombre}</td>
                  <td data-titulo="Correo">{c.correo}</td>
                  <td data-titulo="Rol">{NOMBRE_ROL[c.rol] || c.rol}</td>
                  <td data-titulo="Estado">
                    <EstadoCuenta valor={c.estado} />
                  </td>
                  <td data-titulo="Registro">{fecha(c.fechaRegistro)}</td>
                  <td>
                    <button type="button" className="boton boton--chico" onClick={() => setSeleccion(c)}>
                      Administrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Paginacion pagina={datos.pagina} tamano={TAMANO} total={datos.total} alCambiar={(n) => setFiltros((f) => ({ ...f, pagina: n }))} />
        </>
      )}
      {seleccion && (
        <CambiarCuenta
          cuenta={seleccion}
          esYo={seleccion.idUsuario === usuario.idUsuario}
          alCerrar={() => setSeleccion(null)}
          alGuardar={terminar}
        />
      )}
      {nueva && <NuevaCuenta alCerrar={() => setNueva(false)} alGuardar={terminar} />}
    </section>
  );
}
