# Panel administrativo · React 18 + Vite

Responsable: Erika Josabet Luna García. Para BIBLIOTECARIO y ADMIN; alumnos y profesores usan la app móvil.

Secciones: **Recursos** (alta, edición, mantenimiento, baja), **Préstamos y devoluciones** (aprobar entrega, registrar devolución con resumen de multa y daño), **Multas** (registrar pago o cancelar) y **Usuarios** (solo ADMIN: bloquear o reactivar cuentas, asignar roles y crear cuentas de personal).

Sesión: el token vive en `sessionStorage`, se cierra solo al expirar o ante un 401, y cerrar sesión en una pestaña la cierra en las demás. Diseño responsivo para escritorio, tableta y teléfono.

```bash
npm install
npm run dev                # http://localhost:5173 · el proxy de Vite manda /api/v1/* a cada servicio
npm test                   # 48 pruebas: sesión, navegación, responsivo, páginas y usuarios
VITE_API_URL=http://localhost:8080 npx vitest run src/test/integracion.test.jsx
                           # integración front–back contra el sistema levantado con Docker
npm run build              # el Dockerfile lo sirve con nginx detrás del gateway
```
