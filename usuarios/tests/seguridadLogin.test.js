const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { crearApp } = require('../src/app');
const { crearRepoMemoria } = require('../src/repos/memoryRepo');
const { UsuarioService } = require('../src/services/usuarioService');
const { LimiteIntentos } = require('../src/limiteIntentos');

const config = {
  jwtSecret: 'secreto-prueba', jwtExpiraSeg: 3600, bcryptRondas: 4, dominioCorreo: '',
  serviceToken: 'interno', loginMaxIntentos: 3, loginVentanaSeg: 60
};

describe('Seguridad del inicio de sesión y del registro', () => {
  test('tras varios fallos el correo queda en espera (429 con Retry-After) aunque luego use la contraseña correcta', async () => {
    const app = crearApp({ repo: crearRepoMemoria(), config });
    await request(app).post('/api/v1/usuarios').send({ nombre: 'Ana', correo: 'ana@itl.mx', password: 'Segura123!' });
    const intento = (password) => request(app).post('/api/v1/auth/login').send({ correo: 'ana@itl.mx', password });
    for (let i = 0; i < 3; i++) expect((await intento('mala')).status).toBe(401);
    const r = await intento('Segura123!');
    expect(r.status).toBe(429);
    expect(r.body.codigo).toBe('DEMASIADOS_INTENTOS');
    expect(Number(r.headers['retry-after'])).toBeGreaterThan(0);
  });

  test('el límite se reinicia al pasar la ventana y con un acceso correcto', () => {
    let ahora = 0;
    const l = new LimiteIntentos({ max: 2, ventanaSeg: 60, reloj: () => ahora });
    l.registrarFallo('a');
    l.registrarFallo('a');
    expect(l.esperaSeg('a')).toBe(60);
    ahora = 61000;
    expect(l.esperaSeg('a')).toBe(0);
    l.registrarFallo('b');
    l.limpiar('b');
    l.registrarFallo('b');
    expect(l.esperaSeg('b')).toBe(0);
  });

  test('un correo inexistente también pasa por bcrypt (mismo tiempo de respuesta)', async () => {
    const svc = new UsuarioService(crearRepoMemoria(), config);
    const espia = jest.spyOn(bcrypt, 'compare');
    await expect(svc.login({ correo: 'nadie@itl.mx', password: 'x12345678' })).rejects.toMatchObject({ status: 401 });
    expect(espia).toHaveBeenCalledTimes(1);
    espia.mockRestore();
  });

  test('dos registros simultáneos con el mismo correo: uno 201 y otro 409 (no 500)', async () => {
    const app = crearApp({ repo: crearRepoMemoria(), config });
    const body = { nombre: 'Beto', correo: 'beto@itl.mx', password: 'Segura123!' };
    const estados = (await Promise.all([1, 2].map(() => request(app).post('/api/v1/usuarios').send(body))))
      .map((r) => r.status).sort();
    expect(estados).toEqual([201, 409]);
  });

  test('un administrador no puede quitarse su propio rol', async () => {
    const repo = crearRepoMemoria();
    const app = crearApp({ repo, config });
    const admin = await repo.crear({ nombre: 'Admin', correo: 'admin@itl.mx', passwordHash: 'x', rol: 'ADMIN' });
    const t = jwt.sign({ rol: 'ADMIN' }, config.jwtSecret, { subject: admin.idUsuario });
    const r = await request(app).patch(`/api/v1/usuarios/${admin.idUsuario}/estado`)
      .set('Authorization', `Bearer ${t}`).send({ rol: 'ALUMNO' });
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe('AUTODEGRADACION');
  });
});
