const crypto = require('crypto');

// D8: toda petición lleva X-Correlation-Id; si falta se genera y se devuelve.
function correlacion(req, res, next) {
  const id = req.get('X-Correlation-Id') || crypto.randomUUID().slice(0, 8);
  req.correlacionId = id;
  res.set('X-Correlation-Id', id);
  next();
}

module.exports = { correlacion };
