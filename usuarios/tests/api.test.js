const request = require('supertest');
const jwt = require('jsonwebtoken');
const { crearApp } = require('../src/app');
const { crearRepoMemoria } = require('../src/repos/memoryRepo');

const config = { jwtSecret: 'secreto-prueba', jwtExpiraSeg: 3600, bcryptRondas: 4, dominioCorreo: '', serviceToken: 'interno' };

async function preparar() {
  const repo = crearRepoMemoria();
  const app = crearApp({ repo, config });
  const reg = (body, token) => {
    const r = request(app).post('/api/v1/usuarios').send(body);
    return token ? r.set('Authorization', `Bearer ${token}`) : r;
  };
  const login = async (correo) =>
    (await request(app).post('/api/v1/auth/login').send({ correo, password: 'segura123' })).body.token;
  const adminToken = jwt.sign({ rol: 'ADMIN' }, config.jwtSecret, { subject: 'U1' });
  await reg({ nombre: 'Ana', correo: 'ana@itl.mx', password: 'segura123' });
  await reg({ nombre: 'Laura', correo: 'lau@itl.mx', password: 'segura123', rol: 'BIBLIOTECARIO' }, adminToken);
  return { app, reg, login, adminToken };
}

describe('API de Usuarios (endpoints)', () => {
  test('PI01: login válido devuelve token y datos básicos', async () => {
    const { app } = await preparar();
    const r = await request(app).post('/api/v1/auth/login').send({ correo: 'ana@itl.mx', password: 'segura123' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ tipo: 'Bearer', usuario: { rol: 'ALUMNO' } });
    expect(r.body.token).toBeTruthy();
  });

  test('PI02: login inválido devuelve 401 con formato de error común', async () => {
    const { app } = await preparar();
    const r = await request(app).post('/api/v1/auth/login')
      .set('X-Correlation-Id', 'abc123').send({ correo: 'ana@itl.mx', password: 'mala' });
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ codigo: 'CREDENCIALES_INVALIDAS', mensaje: expect.any(String), correlacionId: 'abc123' });
    expect(r.body.token).toBeUndefined();
  });

  test('registro público devuelve 201 y duplicado 409', async () => {
    const { reg } = await preparar();
    expect((await reg({ nombre: 'Beto', correo: 'beto@itl.mx', password: 'segura123' })).status).toBe(201);
    expect((await reg({ nombre: 'Beto', correo: 'beto@itl.mx', password: 'segura123' })).status).toBe(409);
  });

  test('GET /usuarios/me requiere token (401) y lo resuelve con token', async () => {
    const { app, login } = await preparar();
    expect((await request(app).get('/api/v1/usuarios/me')).status).toBe(401);
    const t = await login('ana@itl.mx');
    const r = await request(app).get('/api/v1/usuarios/me').set('Authorization', `Bearer ${t}`);
    expect(r.status).toBe(200);
    expect(r.body.correo).toBe('ana@itl.mx');
    expect(r.body.passwordHash).toBeUndefined();
  });

  test('PI11: token alterado o expirado devuelve 401', async () => {
    const { app, login } = await preparar();
    const t = await login('ana@itl.mx');
    const alterado = t.slice(0, -3) + 'xyz';
    expect((await request(app).get('/api/v1/usuarios/me').set('Authorization', `Bearer ${alterado}`)).status).toBe(401);
    const vencido = jwt.sign({ rol: 'ALUMNO', exp: Math.floor(Date.now() / 1000) - 10 }, config.jwtSecret, { subject: 'U100' });
    expect((await request(app).get('/api/v1/usuarios/me').set('Authorization', `Bearer ${vencido}`)).status).toBe(401);
  });

  test('estado de cuenta: interno con X-Service-Token, BIBLIOTECARIO sí, ALUMNO no', async () => {
    const { app, login } = await preparar();
    const interno = await request(app).get('/api/v1/usuarios/U100/estado').set('X-Service-Token', 'interno');
    expect(interno.status).toBe(200);
    expect(interno.body).toMatchObject({ idUsuario: 'U100', estado: 'ACTIVO' });
    const tb = await login('lau@itl.mx');
    expect((await request(app).get('/api/v1/usuarios/U100/estado').set('Authorization', `Bearer ${tb}`)).status).toBe(200);
    const ta = await login('ana@itl.mx');
    expect((await request(app).get('/api/v1/usuarios/U100/estado').set('Authorization', `Bearer ${ta}`)).status).toBe(403);
    expect((await request(app).get('/api/v1/usuarios/U100/estado').set('X-Service-Token', 'falso')).status).toBe(401);
  });

  test('solo ADMIN bloquea cuentas; después el login responde 403', async () => {
    const { app, login, adminToken } = await preparar();
    const tb = await login('lau@itl.mx');
    const noAdmin = await request(app).patch('/api/v1/usuarios/U100/estado')
      .set('Authorization', `Bearer ${tb}`).send({ estado: 'BLOQUEADO' });
    expect(noAdmin.status).toBe(403);
    const ok = await request(app).patch('/api/v1/usuarios/U100/estado')
      .set('Authorization', `Bearer ${adminToken}`).send({ estado: 'BLOQUEADO' });
    expect(ok.status).toBe(200);
    const r = await request(app).post('/api/v1/auth/login').send({ correo: 'ana@itl.mx', password: 'segura123' });
    expect(r.status).toBe(403);
  });

  test('JSON mal formado responde 400 y ruta inexistente 404', async () => {
    const { app } = await preparar();
    const r = await request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{malo');
    expect(r.status).toBe(400);
    expect((await request(app).get('/api/v1/nada')).status).toBe(404);
  });

  test('propaga o genera X-Correlation-Id (D8)', async () => {
    const { app } = await preparar();
    const r1 = await request(app).get('/health').set('X-Correlation-Id', 'zz99');
    expect(r1.headers['x-correlation-id']).toBe('zz99');
    const r2 = await request(app).get('/health');
    expect(r2.headers['x-correlation-id']).toHaveLength(8);
  });
});
