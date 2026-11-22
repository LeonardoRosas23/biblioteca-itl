// Configuración tomada de variables de entorno (RNF08). Sin secretos en el código.
function cargarConfig(env = process.env) {
  return {
    puerto: Number(env.PORT || 3001),
    dbUrl: env.DB_URL || 'postgres://postgres:postgres@localhost:5432/bd_usuarios',
    jwtSecret: env.JWT_SECRET || 'solo-para-desarrollo-cambiar-por-secreto-largo',
    jwtExpiraSeg: Number(env.JWT_EXPIRA_SEG || 3600),
    serviceToken: env.SERVICE_TOKEN || 'token-interno-dev',
    bcryptRondas: Number(env.BCRYPT_RONDAS || 10),
    dominioCorreo: env.DOMINIO_CORREO || '', // vacío = cualquier dominio
    loginMaxIntentos: Number(env.LOGIN_MAX_INTENTOS || 5),
    loginVentanaSeg: Number(env.LOGIN_VENTANA_SEG || 900)
  };
}

module.exports = { cargarConfig };
