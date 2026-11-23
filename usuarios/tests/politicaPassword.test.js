const request = require('supertest');
const { crearApp } = require('../src/app');
const { crearRepoMemoria } = require('../src/repos/memoryRepo');
const { revisarPassword, errorPassword } = require('../src/politicaPassword');

describe('Política de contraseñas (RNF06)', () => {
  test.each([
    ['Biblio2026!', null],
    ['Ñandú#2026', null],
    ['corta1!', /entre 8 y 64/],
    ['sinmayuscula1!', /mayúscula/],
    ['SINMINUSCULA1!', /minúscula/],
    ['SinNumero!!', /número/],
    ['SinEspecial123', /especial/],
    ['Con espacio1!', /sin espacios/],
    [`Aa1!${'x'.repeat(61)}`, /entre 8 y 64/]
  ])('%s', (password, esperado) => {
    const msg = errorPassword(password, 'otro@itleon.edu.mx');
    if (esperado === null) expect(msg).toBeNull();
    else expect(msg).toMatch(esperado);
  });

  test('no permite incluir el usuario del correo', () => {
    expect(errorPassword('Ana.Alumna2026!', 'ana.alumna@itleon.edu.mx')).toMatch(/usuario del correo/);
    expect(errorPassword('Biblio2026!', 'ana.alumna@itleon.edu.mx')).toBeNull();
  });

  test('lista todos los requisitos que faltan a la vez', () => {
    expect(errorPassword('abc', 'x@itl.mx')).toMatch(/8 y 64.*mayúscula.*número.*especial/);
  });

  test('la lista de requisitos marca cuáles se cumplen', () => {
    const r = Object.fromEntries(revisarPassword('abcdefgh').map((x) => [x.id, x.ok]));
    expect(r).toMatchObject({ longitud: true, minuscula: true, mayuscula: false, numero: false, especial: false });
  });
});

describe('POST /api/v1/usuarios con contraseña débil', () => {
  test('responde 400 DATOS_INVALIDOS y dice qué falta', async () => {
    const config = { jwtSecret: 's', jwtExpiraSeg: 60, bcryptRondas: 4, dominioCorreo: '', serviceToken: 'i' };
    const app = crearApp({ repo: crearRepoMemoria(), config });
    const r = await request(app).post('/api/v1/usuarios').send({ nombre: 'Ana', correo: 'ana@itl.mx', password: 'segura123' });
    expect(r.status).toBe(400);
    expect(r.body.codigo).toBe('DATOS_INVALIDOS');
    expect(r.body.mensaje).toMatch(/mayúscula.*especial/);
  });
});
