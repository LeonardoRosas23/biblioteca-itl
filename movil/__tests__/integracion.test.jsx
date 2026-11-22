/**
 * Integración front–back (segundo avance): la app real contra el sistema levantado con Docker,
 * sin simular la API. Se omite si no se define E2E.
 *
 *   docker compose up -d --build && ./scripts/cargar-datos-demo.sh
 *   cd movil && E2E=1 EXPO_PUBLIC_API_URL=http://localhost:8080 npx jest __tests__/integracion.test.jsx
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import App from '../src/App';

const correr = process.env.E2E ? describe : describe.skip;
const CORRIDA = Math.random().toString(16).slice(2, 7);
const ESPERA = { timeout: 15000 };
jest.setTimeout(60000);

async function registrar(n) {
  render(<App />);
  fireEvent.press(await screen.findByRole('button', { name: 'Regístrate' }));
  await screen.findByRole('button', { name: 'Crear cuenta' });
  fireEvent.changeText(screen.getByLabelText('Nombre completo'), `Alumno de prueba ${n}`);
  fireEvent.changeText(screen.getByLabelText('Correo institucional'), `app.${CORRIDA}.${n}@itleon.edu.mx`);
  fireEvent.changeText(screen.getByLabelText('Contraseña'), 'Biblio2026!');
  fireEvent.changeText(screen.getByLabelText('Confirmar contraseña'), 'Biblio2026!');
  fireEvent.press(screen.getByRole('button', { name: 'Crear cuenta' }));
}

correr(`App móvil contra el backend real (${process.env.EXPO_PUBLIC_API_URL})`, () => {
  test('un alumno nuevo se registra desde la app y ve el catálogo real', async () => {
    await registrar(1);
    expect(await screen.findByText('Cálculo diferencial', {}, ESPERA)).toBeTruthy();
    fireEvent.press(screen.getByText('Cálculo diferencial'));
    expect(await screen.findByText(/de 3 ejemplares/, {}, ESPERA)).toBeTruthy();
  });

  test('solicita un préstamo, ve la confirmación y lo encuentra en Mis préstamos', async () => {
    await registrar(2);
    fireEvent.press(await screen.findByText('Arduino Uno kit', {}, ESPERA));
    fireEvent.press(await screen.findByRole('button', { name: 'Solicitar préstamo' }, ESPERA));
    const folio = await screen.findByText(/^P-\d{4}$/, {}, ESPERA);
    expect(folio).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Ver mis préstamos' }));
    expect(await screen.findByText('Pendiente de recoger', {}, ESPERA)).toBeTruthy();
  });
});
