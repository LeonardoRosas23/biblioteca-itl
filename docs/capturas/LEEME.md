# Capturas

## Panel web (ya incluidas)

`panel-escritorio-*.png` y `panel-telefono-*.png` son el **panel administrativo** en una pantalla de escritorio y en el ancho de un teléfono (prueba de diseño responsivo). No son la app móvil.

## App móvil (pendiente: tomarlas en un teléfono o emulador)

Estas capturas reemplazan las maquetas de la figura 7.2. Hay que tomarlas con el sistema levantado y los datos de demostración cargados:

```bash
cp .env.example .env               # pon tu IP en HOST_PUBLICO
docker compose up -d --build
./scripts/cargar-datos-demo.sh
cd movil && EXPO_PUBLIC_API_URL=http://<IP-de-tu-PC>:8080 npx expo start
```

Abre la app con Expo Go (el teléfono y la PC en la misma red) y guarda cada pantalla con este nombre:

| Archivo | Pantalla | Cómo llegar | Cuenta |
|---|---|---|---|
| `app-01-login.png` | Inicio de sesión | Al abrir la app | — |
| `app-02-registro.png` | Registro | "Regístrate" | — |
| `app-03-catalogo.png` | Catálogo | Después de entrar | ana.alumna@itleon.edu.mx |
| `app-04-detalle.png` | Detalle del recurso | Tocar "Arduino Uno kit" | ana.alumna |
| `app-05-confirmacion.png` | Confirmación | "Solicitar préstamo" en el detalle | ana.alumna |
| `app-06-mis-prestamos.png` | Mis préstamos · Activos | Pestaña "Mis préstamos" (Laptop vence mañana) | ana.alumna |
| `app-07-vencido-multa.png` | Mis préstamos · Vencidos, con la multa | Pestaña "Vencidos" | beto.alumno@itleon.edu.mx |
| `app-08-avisos.png` | Avisos | Pestaña "Avisos" | beto.alumno |
| `app-09-error-multa.png` | Mensaje "Tienes una multa pendiente…" | Solicitar cualquier recurso | beto.alumno |

Contraseña de todas las cuentas de prueba: `Biblio2026!`. Captura en iOS: botón lateral + subir volumen. En Android: encendido + bajar volumen. En el emulador de Android Studio: el ícono de cámara de la barra lateral.
