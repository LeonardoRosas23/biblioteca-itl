// Configuración de Expo. Toma app.json y agrega lo que depende del entorno de compilación:
//   EXPO_PUBLIC_API_URL  dirección del gateway que usará el APK (p. ej. https://bibliotecaitl.duckdns.org)
// Se permite http:// (sin TLS) porque el uso principal es con el sistema en una laptop de la red local
// (http://IP:8080 o http://localhost:8080 por USB); la dirección se puede cambiar en la app.
module.exports = ({ config }) => {
  const api = process.env.EXPO_PUBLIC_API_URL || '';
  return {
    ...config,
    android: {
      ...config.android,
      package: 'mx.edu.itleon.biblioteca',
      versionCode: Number(process.env.VERSION_CODE || 1)
    },
    plugins: [
      ...(config.plugins || []),
      ['expo-build-properties', {
        android: {
          usesCleartextTraffic: true,
          // expo-modules-core (SDK 52) compila su parte de Compose con Kotlin 1.9.25
          kotlinVersion: '1.9.25'
        }
      }]
    ],
    extra: { ...(config.extra || {}), apiUrl: api }
  };
};
