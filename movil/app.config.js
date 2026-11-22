// Configuración de Expo. Toma app.json y agrega lo que depende del entorno de compilación:
//   EXPO_PUBLIC_API_URL  dirección del gateway que usará el APK (p. ej. https://bibliotecaitl.duckdns.org)
// Si la dirección es http:// (sin TLS), se permite tráfico sin cifrar para que Android no lo bloquee.
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
      ['expo-build-properties', { android: { usesCleartextTraffic: api.startsWith('http://') } }]
    ],
    extra: { ...(config.extra || {}), apiUrl: api }
  };
};
