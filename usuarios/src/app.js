const express = require('express');
const { correlacion } = require('./middleware/correlation');
const { leerToken, requiereAuth, requiereRol } = require('./middleware/auth');
const { manejadorErrores } = require('./middleware/errorHandler');
const { UsuarioService } = require('./services/usuarioService');
const { errores } = require('./errors');

// Envuelve handlers async para que los errores lleguen al manejador común
const a = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function crearApp({ repo, config }) {
  const svc = new UsuarioService(repo, config);
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use(correlacion);
  app.use(leerToken(config));

  app.get('/health', (_req, res) => res.json({ servicio: 'usuarios', estado: 'OK' }));

  // CU08 · Inicio de sesión
  app.post('/api/v1/auth/login', a(async (req, res) => {
    res.json(await svc.login(req.body || {}));
  }));

  // CU08-A3 · Registro (público para ALUMNO/PROFESOR; ADMIN para otros roles)
  app.post('/api/v1/usuarios', a(async (req, res) => {
    res.status(201).json(await svc.registrar(req.body || {}, req.usuario));
  }));

  app.get('/api/v1/usuarios/me', requiereAuth, a(async (req, res) => {
    res.json(await svc.obtener(req.usuario.idUsuario));
  }));

  app.get('/api/v1/usuarios', requiereRol('BIBLIOTECARIO', 'ADMIN'), a(async (req, res) => {
    res.json(await svc.listar(req.query));
  }));

  // Interno (Préstamos) o BIBLIOTECARIO/ADMIN
  app.get('/api/v1/usuarios/:id/estado', requiereRol('BIBLIOTECARIO', 'ADMIN'), a(async (req, res) => {
    res.json(await svc.estado(req.params.id));
  }));

  app.patch('/api/v1/usuarios/:id/estado', a(async (req, res, next) => {
    if (!req.usuario) throw errores.noAutenticado();
    if (req.usuario.rol !== 'ADMIN') throw errores.prohibido('Solo un administrador puede cambiar estados o roles.');
    res.json(await svc.cambiarEstado(req.params.id, req.body || {}, req.usuario));
  }));

  app.use((req, res) => res.status(404).json({
    codigo: 'RUTA_NO_ENCONTRADA', mensaje: `No existe ${req.method} ${req.path}`, correlacionId: req.correlacionId
  }));
  app.use(manejadorErrores);
  return app;
}

module.exports = { crearApp };
