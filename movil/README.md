# App móvil · React Native (Expo SDK 52)

Responsable: Alan Fabricio Gómez Juárez. Para ALUMNO y PROFESOR.

Pantallas (figura 7.2): inicio de sesión (con **Cambiar servidor** para conectarse a la laptop por Wi-Fi o USB), **registro**, catálogo con búsqueda y categorías, detalle del recurso, confirmación de la solicitud, Mis préstamos (activos, vencidos, historial, renovación y multas) y Avisos. El token se guarda en el almacén seguro del sistema (Keychain / Keystore).

```bash
npm install --legacy-peer-deps
EXPO_PUBLIC_API_URL=http://<IP-de-tu-PC>:8080 npx expo start     # escanea el QR con Expo Go
npm test                   # 34 pruebas: sesión, registro, servidor, navegación y responsivo
E2E=1 EXPO_PUBLIC_API_URL=http://localhost:8080 npx jest __tests__/integracion.test.jsx
                           # integración front–back contra el sistema levantado con Docker
```

En un teléfono real usa la IP de tu PC en la red, no `localhost`. Para tomar las capturas de la entrega, ver `docs/capturas/LEEME.md`.
