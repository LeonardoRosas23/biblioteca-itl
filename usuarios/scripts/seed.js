// Crea usuarios de prueba si no existen.
// Contraseña: SEED_PASSWORD (en producción la genera deploy/oracle/instalar.sh); en desarrollo, Biblio2026!
const { cargarConfig } = require('../src/config');
const { crearRepoPg } = require('../src/repos/pgRepo');
const { UsuarioService } = require('../src/services/usuarioService');

const USUARIOS = [
  { nombre: 'Administrador General', correo: 'admin@itleon.edu.mx', rol: 'ADMIN' },
  { nombre: 'Laura Bibliotecaria', correo: 'biblioteca@itleon.edu.mx', rol: 'BIBLIOTECARIO' },
  { nombre: 'Ana Alumna', correo: 'ana.alumna@itleon.edu.mx', rol: 'ALUMNO' },
  { nombre: 'Beto Alumno', correo: 'beto.alumno@itleon.edu.mx', rol: 'ALUMNO' },
  { nombre: 'Carla Profesora', correo: 'carla.profe@itleon.edu.mx', rol: 'PROFESOR' }
];

const PASSWORD = process.env.SEED_PASSWORD || 'Biblio2026!';

(async () => {
  const config = cargarConfig();
  const repo = crearRepoPg(config.dbUrl);
  await repo.inicializar();
  const svc = new UsuarioService(repo, config);
  for (const u of USUARIOS) {
    if (await repo.buscarPorCorreo(u.correo)) { console.log(`ya existe ${u.correo}`); continue; }
    const creado = await svc.registrar({ ...u, password: PASSWORD }, { rol: 'ADMIN' });
    console.log(`creado ${creado.idUsuario} ${creado.correo} (${creado.rol})`);
  }
  await repo.pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
