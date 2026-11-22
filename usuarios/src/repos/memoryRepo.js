// Repositorio en memoria: mismo contrato que pgRepo. Se usa en pruebas unitarias.
function crearRepoMemoria() {
  const usuarios = new Map();
  let seq = 100;

  return {
    async crear({ nombre, correo, passwordHash, rol }) {
      // Igual que el índice único ux_usuario_correo de PostgreSQL
      for (const x of usuarios.values()) {
        if (x.correo === correo) throw Object.assign(new Error('duplicate key'), { code: '23505' });
      }
      const u = {
        idUsuario: `U${seq++}`, nombre, correo, passwordHash, rol,
        estado: 'ACTIVO', fechaRegistro: new Date().toISOString()
      };
      usuarios.set(u.idUsuario, u);
      return { ...u };
    },
    async buscarPorCorreo(correo) {
      for (const u of usuarios.values()) if (u.correo === correo) return { ...u };
      return null;
    },
    async buscarPorId(id) {
      const u = usuarios.get(id);
      return u ? { ...u } : null;
    },
    async actualizar(id, cambios) {
      const u = usuarios.get(id);
      if (!u) return null;
      Object.assign(u, cambios);
      return { ...u };
    },
    async listar({ q, rol, pagina, tamano }) {
      let lista = [...usuarios.values()];
      if (rol) lista = lista.filter((u) => u.rol === rol);
      if (q) {
        const t = q.toLowerCase();
        lista = lista.filter((u) => u.nombre.toLowerCase().includes(t) || u.correo.includes(t) || u.idUsuario.toLowerCase() === t);
      }
      const total = lista.length;
      const items = lista.slice((pagina - 1) * tamano, pagina * tamano).map((u) => ({ ...u }));
      return { items, total };
    }
  };
}

module.exports = { crearRepoMemoria };
