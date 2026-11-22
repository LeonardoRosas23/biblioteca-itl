const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const COLUMNAS = `id_usuario AS "idUsuario", nombre, correo, password_hash AS "passwordHash",
  rol, estado, fecha_registro AS "fechaRegistro"`;

function crearRepoPg(dbUrl) {
  const pool = new Pool({ connectionString: dbUrl });

  return {
    pool,
    async inicializar() {
      const ddl = fs.readFileSync(path.join(__dirname, '../../db/schema.sql'), 'utf8');
      await pool.query(ddl);
    },
    async crear({ nombre, correo, passwordHash, rol }) {
      const { rows } = await pool.query(
        `INSERT INTO usuario (id_usuario, nombre, correo, password_hash, rol)
         VALUES ('U' || nextval('usuario_seq'), $1, $2, $3, $4)
         RETURNING ${COLUMNAS}`,
        [nombre, correo, passwordHash, rol]
      );
      return rows[0];
    },
    async buscarPorCorreo(correo) {
      const { rows } = await pool.query(`SELECT ${COLUMNAS} FROM usuario WHERE correo = $1`, [correo]);
      return rows[0] || null;
    },
    async buscarPorId(id) {
      const { rows } = await pool.query(`SELECT ${COLUMNAS} FROM usuario WHERE id_usuario = $1`, [id]);
      return rows[0] || null;
    },
    async actualizar(id, { estado, rol }) {
      const { rows } = await pool.query(
        `UPDATE usuario SET estado = COALESCE($2, estado), rol = COALESCE($3, rol),
           fecha_actualizacion = now()
         WHERE id_usuario = $1 RETURNING ${COLUMNAS}`,
        [id, estado || null, rol || null]
      );
      return rows[0] || null;
    },
    async listar({ q, rol, pagina, tamano }) {
      const filtros = [];
      const params = [];
      if (rol) { params.push(rol); filtros.push(`rol = $${params.length}`); }
      if (q) {
        // % y _ escritos por el usuario se buscan como texto, no como comodines
        const literal = q.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`);
        params.push(`%${literal}%`);
        filtros.push(`(lower(nombre) LIKE $${params.length} OR correo LIKE $${params.length} OR lower(id_usuario) = $${params.length + 1})`);
        params.push(q.toLowerCase());
      }
      const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
      const total = Number((await pool.query(`SELECT count(*) FROM usuario ${where}`, params)).rows[0].count);
      params.push(tamano, (pagina - 1) * tamano);
      const { rows } = await pool.query(
        `SELECT ${COLUMNAS} FROM usuario ${where} ORDER BY id_usuario LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      return { items: rows, total };
    }
  };
}

module.exports = { crearRepoPg };
