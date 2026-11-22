const jwt = require('jsonwebtoken');
const { UsuarioService } = require('../src/services/usuarioService');
const { crearRepoMemoria } = require('../src/repos/memoryRepo');

const config = { jwtSecret: 'secreto-prueba', jwtExpiraSeg: 3600, bcryptRondas: 4, dominioCorreo: '' };
const base = { nombre: 'Ana', correo: 'ana@itl.mx', password: 'segura123' };

describe('UsuarioService (unitarias)', () => {
  let repo;
  let svc;
  beforeEach(() => {
    repo = crearRepoMemoria();
    svc = new UsuarioService(repo, config);
  });

  describe('registro', () => {
    test('crea un ALUMNO por defecto y nunca devuelve el hash', async () => {
      const u = await svc.registrar(base);
      expect(u.rol).toBe('ALUMNO');
      expect(u.estado).toBe('ACTIVO');
      expect(u.passwordHash).toBeUndefined();
    });

    test('guarda la contraseña como hash bcrypt, no en texto plano (RNF06)', async () => {
      await svc.registrar(base);
      const guardado = await repo.buscarPorCorreo('ana@itl.mx');
      expect(guardado.passwordHash).not.toBe('segura123');
      expect(guardado.passwordHash).toMatch(/^\$2[aby]\$/);
    });

    test('normaliza el correo a minúsculas', async () => {
      const u = await svc.registrar({ ...base, correo: 'ANA@ITL.MX' });
      expect(u.correo).toBe('ana@itl.mx');
    });

    test.each([
      [{ ...base, nombre: '' }, /nombre/],
      [{ ...base, correo: 'no-es-correo' }, /formato/],
      [{ ...base, password: 'corta' }, /8 caracteres/],
      [{ ...base, rol: 'SUPERUSUARIO' }, /Rol no válido/]
    ])('rechaza datos inválidos %#', async (datos, msg) => {
      await expect(svc.registrar(datos)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(msg) });
    });

    test('rechaza correo duplicado con 409', async () => {
      await svc.registrar(base);
      await expect(svc.registrar(base)).rejects.toMatchObject({ status: 409, codigo: 'CORREO_REGISTRADO' });
    });

    test('RN10: el autorregistro no puede crear BIBLIOTECARIO', async () => {
      await expect(svc.registrar({ ...base, rol: 'BIBLIOTECARIO' })).rejects.toMatchObject({ status: 403 });
    });

    test('RN10: un ADMIN sí puede crear BIBLIOTECARIO', async () => {
      const u = await svc.registrar({ ...base, rol: 'BIBLIOTECARIO' }, { rol: 'ADMIN' });
      expect(u.rol).toBe('BIBLIOTECARIO');
    });

    test('exige dominio institucional cuando está configurado', async () => {
      const s = new UsuarioService(repo, { ...config, dominioCorreo: 'itleon.edu.mx' });
      await expect(s.registrar(base)).rejects.toMatchObject({ status: 400 });
      await expect(s.registrar({ ...base, correo: 'ana@itleon.edu.mx' })).resolves.toBeDefined();
    });
  });

  describe('login (CU08)', () => {
    beforeEach(() => svc.registrar(base));

    test('emite un JWT con sub = idUsuario, rol y expiración', async () => {
      const r = await svc.login({ correo: 'ana@itl.mx', password: 'segura123' });
      const datos = jwt.verify(r.token, 'secreto-prueba');
      expect(datos.sub).toBe(r.usuario.idUsuario);
      expect(datos.rol).toBe('ALUMNO');
      expect(datos.exp - datos.iat).toBe(3600);
      expect(r.tipo).toBe('Bearer');
    });

    test('contraseña incorrecta y correo inexistente dan el mismo error genérico', async () => {
      const e1 = await svc.login({ correo: 'ana@itl.mx', password: 'mala12345' }).catch((e) => e);
      const e2 = await svc.login({ correo: 'nadie@itl.mx', password: 'segura123' }).catch((e) => e);
      expect(e1.status).toBe(401);
      expect(e1.codigo).toBe('CREDENCIALES_INVALIDAS');
      expect(e2.message).toBe(e1.message);
    });

    test('cuenta bloqueada responde 403', async () => {
      const u = await repo.buscarPorCorreo('ana@itl.mx');
      await repo.actualizar(u.idUsuario, { estado: 'BLOQUEADO' });
      await expect(svc.login({ correo: 'ana@itl.mx', password: 'segura123' })).rejects.toMatchObject({ status: 403 });
    });

    test('el token no contiene datos sensibles', async () => {
      const r = await svc.login({ correo: 'ana@itl.mx', password: 'segura123' });
      const datos = jwt.decode(r.token);
      expect(Object.keys(datos).sort()).toEqual(['exp', 'iat', 'rol', 'sub']);
    });
  });

  describe('estado y administración', () => {
    test('estado() devuelve rol y estado para Préstamos', async () => {
      const u = await svc.registrar(base);
      await expect(svc.estado(u.idUsuario)).resolves.toEqual({
        idUsuario: u.idUsuario, nombre: 'Ana', rol: 'ALUMNO', estado: 'ACTIVO'
      });
    });

    test('usuario inexistente da 404', async () => {
      await expect(svc.estado('U999')).rejects.toMatchObject({ status: 404 });
    });

    test('un ADMIN bloquea y reasigna rol', async () => {
      const u = await svc.registrar(base);
      const r = await svc.cambiarEstado(u.idUsuario, { estado: 'BLOQUEADO', rol: 'PROFESOR' }, { idUsuario: 'U1', rol: 'ADMIN' });
      expect(r).toMatchObject({ estado: 'BLOQUEADO', rol: 'PROFESOR' });
    });

    test('un ADMIN no puede bloquearse a sí mismo', async () => {
      const u = await svc.registrar({ ...base, rol: 'ADMIN' }, { rol: 'ADMIN' });
      await expect(svc.cambiarEstado(u.idUsuario, { estado: 'BLOQUEADO' }, { idUsuario: u.idUsuario, rol: 'ADMIN' }))
        .rejects.toMatchObject({ status: 409 });
    });

    test('listar pagina y filtra por texto', async () => {
      for (let i = 0; i < 5; i++) await svc.registrar({ ...base, nombre: `Alumno ${i}`, correo: `a${i}@itl.mx` });
      const r = await svc.listar({ pagina: 2, tamano: 2 });
      expect(r).toMatchObject({ pagina: 2, tamano: 2, total: 5 });
      expect(r.items).toHaveLength(2);
      const f = await svc.listar({ q: 'alumno 3' });
      expect(f.total).toBe(1);
    });
  });
});
