// Error de dominio con el formato común de la API: { codigo, mensaje, correlacionId }
class ApiError extends Error {
  constructor(status, codigo, mensaje) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
  }
}

const errores = {
  datosInvalidos: (m) => new ApiError(400, 'DATOS_INVALIDOS', m),
  noAutenticado: (m = 'Se requiere un token válido.') => new ApiError(401, 'NO_AUTENTICADO', m),
  credenciales: () => new ApiError(401, 'CREDENCIALES_INVALIDAS', 'Correo o contraseña incorrectos.'),
  prohibido: (m = 'Tu rol no permite esta acción.') => new ApiError(403, 'ACCESO_DENEGADO', m),
  noEncontrado: (m = 'El usuario no existe.') => new ApiError(404, 'USUARIO_NO_ENCONTRADO', m),
  conflicto: (codigo, m) => new ApiError(409, codigo, m),
  demasiadosIntentos: (seg) => Object.assign(
    new ApiError(429, 'DEMASIADOS_INTENTOS',
      `Demasiados intentos fallidos. Espera ${Math.ceil(seg / 60)} minuto(s) e inténtalo de nuevo.`),
    { reintentarEnSeg: seg })
};

module.exports = { ApiError, errores };
