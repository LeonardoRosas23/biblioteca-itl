import { pedir } from './cliente';

export const auth = {
  login: (correo, password) => pedir('/api/v1/auth/login', { metodo: 'POST', cuerpo: { correo, password } })
};

export const recursos = {
  listar: (params) => pedir('/api/v1/recursos', { params }),
  obtener: (id) => pedir(`/api/v1/recursos/${encodeURIComponent(id)}`),
  crear: (datos) => pedir('/api/v1/recursos', { metodo: 'POST', cuerpo: datos }),
  modificar: (id, datos) => pedir(`/api/v1/recursos/${encodeURIComponent(id)}`, { metodo: 'PUT', cuerpo: datos }),
  cambiarEstado: (id, estado) =>
    pedir(`/api/v1/recursos/${encodeURIComponent(id)}/estado`, { metodo: 'PATCH', cuerpo: { estado } }),
  reparar: (id) => pedir(`/api/v1/recursos/${encodeURIComponent(id)}/mantenimiento/reparar`, { metodo: 'POST' }),
  categorias: () => pedir('/api/v1/categorias')
};

export const prestamos = {
  listar: (params) => pedir('/api/v1/prestamos', { params }),
  aprobar: (id) => pedir(`/api/v1/prestamos/${encodeURIComponent(id)}/aprobar`, { metodo: 'PATCH' }),
  devolver: (id, danado) =>
    pedir(`/api/v1/prestamos/${encodeURIComponent(id)}/devolucion`, { metodo: 'POST', cuerpo: { danado } })
};

export const multas = {
  listar: (params) => pedir('/api/v1/multas', { params }),
  resolver: (id, estadoPago) => pedir(`/api/v1/multas/${encodeURIComponent(id)}/estado`, { metodo: 'PATCH', cuerpo: { estadoPago } })
};

// Solo ADMIN (sección 5.7)
export const usuarios = {
  listar: (params) => pedir('/api/v1/usuarios', { params }),
  crear: (datos) => pedir('/api/v1/usuarios', { metodo: 'POST', cuerpo: datos }),
  cambiar: (id, cambios) => pedir(`/api/v1/usuarios/${encodeURIComponent(id)}/estado`, { metodo: 'PATCH', cuerpo: cambios })
};
