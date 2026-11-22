const jwt = require('jsonwebtoken');
const { errores } = require('../errors');

// Lee el JWT del encabezado Authorization. Si es válido deja req.usuario = { idUsuario, rol }.
// No falla si no hay token: las rutas deciden con requiereAuth / requiereRol.
function leerToken(config) {
  return (req, _res, next) => {
    const h = req.get('Authorization') || '';
    if (req.get('X-Service-Token') && req.get('X-Service-Token') === config.serviceToken) {
      req.servicioInterno = true;
    }
    if (!h.startsWith('Bearer ')) return next();
    try {
      const datos = jwt.verify(h.slice(7), config.jwtSecret);
      req.usuario = { idUsuario: datos.sub, rol: datos.rol };
      next();
    } catch {
      next(errores.noAutenticado('El token es inválido o expiró.'));
    }
  };
}

function requiereAuth(req, _res, next) {
  if (!req.usuario) return next(errores.noAutenticado());
  next();
}

// Permite el acceso a los roles indicados o a otro servicio de la red interna.
function requiereRol(...roles) {
  return (req, _res, next) => {
    if (req.servicioInterno) return next();
    if (!req.usuario) return next(errores.noAutenticado());
    if (!roles.includes(req.usuario.rol)) return next(errores.prohibido());
    next();
  };
}

module.exports = { leerToken, requiereAuth, requiereRol };
