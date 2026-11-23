const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { errores } = require('../errors');
const { LimiteIntentos } = require('../limiteIntentos');
const { errorPassword } = require('../politicaPassword');

const ROLES = ['ALUMNO', 'PROFESOR', 'BIBLIOTECARIO', 'ADMIN'];
const ROLES_AUTORREGISTRO = ['ALUMNO', 'PROFESOR'];
const ESTADOS = ['ACTIVO', 'BLOQUEADO', 'INACTIVO'];
const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Vista pública: nunca expone passwordHash
function publico(u) {
  const { passwordHash, ...resto } = u;
  return resto;
}

class UsuarioService {
  constructor(repo, config, { reloj } = {}) {
    this.repo = repo;
    this.config = config;
    this.limite = new LimiteIntentos({
      max: config.loginMaxIntentos || 5,
      ventanaSeg: config.loginVentanaSeg || 900,
      reloj
    });
    // Hash de relleno: si el correo no existe se compara contra él, para que la respuesta tarde
    // lo mismo que con un correo real y no se pueda saber qué cuentas existen (CU08-A1).
    this.hashRelleno = bcrypt.hashSync('contrasena-de-relleno', config.bcryptRondas || 10);
  }

  validarRegistro({ nombre, correo, password, rol }) {
    const faltan = [];
    if (!nombre || !String(nombre).trim()) faltan.push('nombre');
    if (!correo) faltan.push('correo');
    if (!password) faltan.push('password');
    if (faltan.length) throw errores.datosInvalidos(`Faltan campos obligatorios: ${faltan.join(', ')}.`);
    if (!REGEX_CORREO.test(correo)) throw errores.datosInvalidos('El correo no tiene un formato válido.');
    const dom = this.config.dominioCorreo;
    if (dom && !correo.toLowerCase().endsWith(`@${dom}`)) {
      throw errores.datosInvalidos(`Usa tu correo institucional (@${dom}).`);
    }
    const fallaPassword = errorPassword(password, correo);
    if (fallaPassword) throw errores.datosInvalidos(fallaPassword);
    if (rol && !ROLES.includes(rol)) throw errores.datosInvalidos(`Rol no válido. Usa uno de: ${ROLES.join(', ')}.`);
  }

  // RN10: el autorregistro solo crea ALUMNO o PROFESOR; los demás roles requieren un ADMIN.
  async registrar(datos, solicitante) {
    this.validarRegistro(datos);
    const rol = datos.rol || 'ALUMNO';
    const esAdmin = solicitante && solicitante.rol === 'ADMIN';
    if (!ROLES_AUTORREGISTRO.includes(rol) && !esAdmin) {
      throw errores.prohibido('Solo un administrador puede asignar los roles BIBLIOTECARIO o ADMIN.');
    }
    const correo = datos.correo.trim().toLowerCase();
    if (await this.repo.buscarPorCorreo(correo)) {
      throw errores.conflicto('CORREO_REGISTRADO', 'Ya existe una cuenta con ese correo.');
    }
    const passwordHash = await bcrypt.hash(String(datos.password), this.config.bcryptRondas);
    try {
      const u = await this.repo.crear({ nombre: datos.nombre.trim(), correo, passwordHash, rol });
      return publico(u);
    } catch (e) {
      // Dos registros simultáneos con el mismo correo: el índice único de la base decide.
      if (e.code === '23505') throw errores.conflicto('CORREO_REGISTRADO', 'Ya existe una cuenta con ese correo.');
      throw e;
    }
  }

  // CU08: el mensaje de error no revela si falló el correo o la contraseña.
  async login({ correo, password }) {
    if (!correo || !password) throw errores.datosInvalidos('Captura correo y contraseña.');
    const clave = String(correo).trim().toLowerCase();
    const espera = this.limite.esperaSeg(clave);
    if (espera > 0) throw errores.demasiadosIntentos(espera);
    const u = await this.repo.buscarPorCorreo(clave);
    const coincide = await bcrypt.compare(String(password), u ? u.passwordHash : this.hashRelleno);
    if (!u || !coincide) {
      this.limite.registrarFallo(clave);
      throw errores.credenciales();
    }
    this.limite.limpiar(clave);
    if (u.estado === 'BLOQUEADO') throw errores.prohibido('Tu cuenta está bloqueada. Acude a la biblioteca.');
    if (u.estado === 'INACTIVO') throw errores.prohibido('Tu cuenta está inactiva.');
    const token = jwt.sign({ rol: u.rol }, this.config.jwtSecret, {
      subject: u.idUsuario,
      expiresIn: this.config.jwtExpiraSeg
    });
    return {
      token,
      tipo: 'Bearer',
      expiraEn: this.config.jwtExpiraSeg,
      usuario: { idUsuario: u.idUsuario, nombre: u.nombre, correo: u.correo, rol: u.rol }
    };
  }

  async obtener(id) {
    const u = await this.repo.buscarPorId(id);
    if (!u) throw errores.noEncontrado();
    return publico(u);
  }

  async estado(id) {
    const u = await this.obtener(id);
    return { idUsuario: u.idUsuario, nombre: u.nombre, rol: u.rol, estado: u.estado };
  }

  async cambiarEstado(id, { estado, rol }, solicitante) {
    if (!estado && !rol) throw errores.datosInvalidos('Indica estado o rol.');
    if (estado && !ESTADOS.includes(estado)) throw errores.datosInvalidos(`Estado no válido. Usa: ${ESTADOS.join(', ')}.`);
    if (rol && !ROLES.includes(rol)) throw errores.datosInvalidos(`Rol no válido. Usa: ${ROLES.join(', ')}.`);
    if (solicitante && solicitante.idUsuario === id && (estado && estado !== 'ACTIVO')) {
      throw errores.conflicto('AUTOBLOQUEO', 'Un administrador no puede bloquear su propia cuenta.');
    }
    if (solicitante && solicitante.idUsuario === id && rol && rol !== 'ADMIN') {
      throw errores.conflicto('AUTODEGRADACION', 'Un administrador no puede quitarse su propio rol.');
    }
    const u = await this.repo.actualizar(id, { estado, rol });
    if (!u) throw errores.noEncontrado();
    return publico(u);
  }

  async listar({ q, rol, pagina = 1, tamano = 20 }) {
    pagina = Math.max(1, Number(pagina) || 1);
    tamano = Math.min(100, Math.max(1, Number(tamano) || 20));
    const { items, total } = await this.repo.listar({ q, rol, pagina, tamano });
    return { items: items.map(publico), pagina, tamano, total };
  }
}

module.exports = { UsuarioService };
