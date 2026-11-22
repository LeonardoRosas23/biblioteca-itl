const { ApiError } = require('../errors');

function manejadorErrores(err, req, res, _next) {
  const correlacionId = req.correlacionId;
  if (err instanceof ApiError) {
    if (err.reintentarEnSeg) res.set('Retry-After', String(err.reintentarEnSeg));
    return res.status(err.status).json({ codigo: err.codigo, mensaje: err.message, correlacionId });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ codigo: 'JSON_INVALIDO', mensaje: 'El cuerpo no es JSON válido.', correlacionId });
  }
  // Nunca se registran contraseñas ni tokens completos (RNF06)
  console.error(`[${correlacionId}] Error no controlado:`, err.message);
  res.status(500).json({ codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado.', correlacionId });
}

module.exports = { manejadorErrores };
