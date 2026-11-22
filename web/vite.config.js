import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo, sin gateway, cada ruta /api/v1/* va directo a su microservicio.
const usuarios = 'http://localhost:3001';
const catalogo = 'http://localhost:8000';
const prestamos = 'http://localhost:8080';
const notificaciones = 'http://localhost:8090';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api/v1/auth': usuarios,
      '/api/v1/usuarios': usuarios,
      '/api/v1/recursos': catalogo,
      '/api/v1/categorias': catalogo,
      '/api/v1/prestamos': prestamos,
      '/api/v1/multas': prestamos,
      '/api/v1/notificaciones': notificaciones
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    coverage: { reporter: ['text-summary', 'text'], include: ['src/**/*.{js,jsx}'], exclude: ['src/test/**', 'src/main.jsx'] }
  }
});
