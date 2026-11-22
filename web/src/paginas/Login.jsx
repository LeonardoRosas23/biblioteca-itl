import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useSesion } from '../sesion/SesionContext';

export default function Login() {
  const { sesion, iniciarSesion, motivoCierre } = useSesion();
  const navegar = useNavigate();
  const { state } = useLocation();
  const destino = state?.desde && state.desde !== '/login' ? state.desde : '/prestamos';
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  if (sesion) return <Navigate to={destino} replace />;

  async function enviar(e) {
    e.preventDefault();
    if (!correo.trim() || !password) {
      setError('Captura tu correo institucional y tu contraseña.');
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      await iniciarSesion(correo.trim(), password);
      navegar(destino, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="acceso">
      <form className="acceso__tarjeta" onSubmit={enviar} noValidate>
        <p className="acceso__institucion">Instituto Tecnológico de León</p>
        <h1>Panel de biblioteca</h1>
        {motivoCierre && (
          <p className="mensaje mensaje--aviso" role="status">
            {motivoCierre}
          </p>
        )}
        <label htmlFor="correo">Correo institucional</label>
        <input id="correo" type="email" autoComplete="username" value={correo} onChange={(e) => setCorreo(e.target.value)} />
        <label htmlFor="password">Contraseña</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p className="mensaje mensaje--error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="boton boton--primario" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Iniciar sesión'}
        </button>
      </form>
    </main>
  );
}
