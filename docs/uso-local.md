# Uso local: laptop con Windows 11 + teléfono Android

Todo el sistema corre en la laptop con Docker. El panel web se abre en el navegador, y la app se instala en el teléfono como APK y se conecta a la laptop por **Wi-Fi** o por **cable USB**.

```
 Teléfono (APK) ──Wi-Fi o USB──►  Laptop: Docker Desktop
                                    gateway :8080 ─► usuarios · catálogo · préstamos · notificaciones · panel web
 Navegador ──────────────────────►  http://localhost:8080
```

## 0. Requisitos (una sola vez)

| En la laptop | Comprobación |
|---|---|
| Docker Desktop (motor WSL 2) | Abre Docker Desktop y espera a que diga *Engine running* |
| Git for Windows (incluye Git Bash) | `git --version` |
| Node.js 22 | `node -v` → `v22.x` |
| Python 3.12 o 3.13 | `py --version` |
| Android Studio (trae `adb`) | `& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" version` |

En el teléfono no hay que instalar nada antes: el APK se descarga en el paso 4.

## 1. Bajar el proyecto y configurarlo

En PowerShell:

```powershell
mkdir C:\proyectos -Force; cd C:\proyectos
git clone https://github.com/LeonardoRosas23/biblioteca-itl.git
cd biblioteca-itl
Copy-Item .env.example .env
notepad .env
```

En el `.env`:
- Cambia `JWT_SECRET` por una frase de al menos 32 caracteres.
- Cambia `SERVICE_TOKEN` por cualquier texto.
- Deja `SEED_PASSWORD=Biblio2026!`.

Guarda y cierra.

## 2. Levantar el sistema

```powershell
docker compose up -d --build
docker compose ps
```

- La primera vez tarda de 10 a 20 minutos, porque descarga imágenes, compila Java y corre las pruebas dentro de las imágenes.
- Deben aparecer **10 contenedores** en estado `running`.
- Si quieres que los recordatorios y vencimientos corran cada 10 segundos en lugar de a las 8:00 a. m., usa `docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d --build`.

**Cargar los datos de prueba** (en **Git Bash**, no en PowerShell):

```bash
cd /c/proyectos/biblioteca-itl
./scripts/cargar-datos-demo.sh
```

**Comprobación:** abre **http://localhost:8080** y entra con `biblioteca@itleon.edu.mx` / `Biblio2026!`.

## 3. Conectar el teléfono con la laptop

Elige **una** de las dos formas. La del cable es la más confiable, sobre todo en la red de la escuela.

### Opción A · Cable USB (no depende de la red)

1. **En el teléfono, activa la depuración USB** (una sola vez):
   - *Configuración → Acerca del teléfono → Información de software* → toca **Número de compilación** 7 veces.
   - *Configuración → Opciones de desarrollador* → activa **Depuración USB**.
2. Conecta el teléfono a la laptop con el cable USB y acepta **"¿Permitir depuración USB?"** → *Permitir siempre*.
3. En PowerShell:
   ```powershell
   & "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" reverse tcp:8080 tcp:8080
   ```
   Desde ese momento, en el teléfono `http://localhost:8080` es la laptop.
4. En la app, el servidor es **http://localhost:8080**, que es el valor de fábrica, así que no hay que cambiar nada.

> Cada vez que desconectes y vuelvas a conectar el cable, repite el paso 3.

### Opción B · Misma red Wi-Fi

1. La laptop y el teléfono deben estar **en la misma red**.
   - Las redes de escuela suelen bloquear la conexión entre equipos. Si es tu caso, activa el **hotspot del teléfono** y conecta la laptop a él.
2. **Marca la red como privada en Windows:** *Configuración → Red e Internet → Wi-Fi → (tu red) → Tipo de perfil de red → Privada*.
3. **Abre el puerto 8080** en el firewall. En PowerShell **como administrador**, una sola vez:
   ```powershell
   New-NetFirewallRule -DisplayName "Biblioteca ITL 8080" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow -Profile Private
   ```
4. **Averigua la IP de la laptop:** `ipconfig` → *Adaptador de LAN inalámbrica Wi-Fi* → **Dirección IPv4**, por ejemplo `192.168.1.50`.
5. **Prueba desde el teléfono:** abre Chrome en `http://192.168.1.50:8080/health`. Debe responder.
6. En la app, en la pantalla de inicio de sesión: **Cambiar servidor** → `192.168.1.50:8080` → **Probar y guardar** → "Conectado con el servidor".

> Si cambias de red, la IP cambia: repite los pasos 4 a 6. La app recuerda el último servidor que guardaste.

## 4. Instalar la app en el teléfono

1. En el teléfono, abre Chrome en **github.com/LeonardoRosas23/biblioteca-itl/releases** → **App Android** → toca `biblioteca-itl.apk`.
2. Abre la descarga → **Instalar**.
   - Si no se permite: **Configuración → Instalar apps desconocidas → Chrome → Permitir**.
   - Si Play Protect advierte: **Más detalles → Instalar de todas formas**.
3. Abre **Biblioteca ITL**. Abajo de la pantalla de inicio de sesión aparece **Servidor:**; ajústalo según el paso 3.

Si el APK no estuviera en Releases, genéralo en GitHub → **Actions** → **APK Android** → **Run workflow**, dejando `http://localhost:8080`.

## 5. Recorrido de pruebas

Contraseña de todas las cuentas: `Biblio2026!`. Panel = navegador de la laptop. App = teléfono.

| # | Dónde | Qué hacer | Qué debe pasar | Cubre |
|---|---|---|---|---|
| 1 | Panel | Entra como `biblioteca@itleon.edu.mx` | Lista de préstamos | CU08, PI01 |
| 2 | Panel | Contraseña incorrecta 6 veces con `prueba@itleon.edu.mx` | Error genérico y, al sexto, "Demasiados intentos" | PI02, RNF06 |
| 3 | Panel | Entra como `ana.alumna@itleon.edu.mx` | "Alumnos y profesores usan la app" | RN10 |
| 4 | App | **Regístrate** con tu correo @itleon.edu.mx | Entra directo al catálogo | CU08‑A3 |
| 5 | App | Busca "cálculo"; filtra por categoría | Solo lo que coincide | CU02, PI04 |
| 6 | App | Abre "Laptop Lenovo ThinkPad" | 0 de 1, no disponible | PI08 |
| 7 | App | "Arduino Uno kit" → **Solicitar préstamo** | Confirmación con folio P‑xxxx; aviso en *Avisos* | CU01, PI07, RF08 |
| 8 | Panel | Busca el folio → **Aprobar entrega** | "Activo" con fecha límite de hoy + 3 días | CU04, PI12, RN05 |
| 9 | App | Mis préstamos → **Renovar** dos veces | La primera extiende la fecha; la segunda la rechaza | CU06, PI15, RN06 |
| 10 | Panel | **Registrar devolución** del préstamo | "A tiempo", sin multa | CU05, PI13 |
| 11 | App | Entra como `beto.alumno@itleon.edu.mx` → solicita algo | "Tienes una multa pendiente…" | RN02, PI10 |
| 12 | Panel | Multas → M‑0001 → **Registrar pago**; beto vuelve a solicitar | Ahora lo rechaza por su préstamo vencido | RN08 |
| 13 | Panel | Devolución de P‑0003 (beto), marcando "dañado" | Multa de $30.00 y el proyector pasa a mantenimiento | PI14, RN07 |
| 14 | App | Ana solicita 2 recursos más | El segundo dice que alcanzó el límite de 3 | RN03 |
| 15 | Panel | Como `admin@itleon.edu.mx` → **Usuarios** → bloquea tu cuenta nueva | En la app ya no puedes entrar; reactívala después | RF01, RN02 |
| 16 | App | Cierra la app por completo y ábrela | Sigue con la sesión iniciada | Sesiones |
| 17 | Laptop | `docker compose stop notificaciones` → solicita algo en la app → `docker compose start notificaciones` | El préstamo se crea igual y el aviso llega 1 o 2 minutos después | RNF04, PI18 |
| 18 | Laptop | `docker compose stop catalogo` → solicita algo → `docker compose start catalogo` | "Servicio no disponible" y no se crea el préstamo | PI19 |
| 19 | Navegador | F12 → vista de teléfono y de tablet | El panel se adapta | RNF07 |
| 20 | Navegador del teléfono | `http://IP-de-la-laptop:8080` (solo con Wi-Fi) | El panel en versión móvil | RNF07 |

Pruebas automáticas, opcionales, con el sistema arriba:

```powershell
py -m pip install httpx PyJWT
$env:JWT_SECRET="el-de-tu-.env"
py pruebas-integracion\e2e_gateway.py          # 22 casos: PI01–PI19, rutas internas, D8, HTTPS
```

## 6. Uso diario

| Acción | Comando |
|---|---|
| Encender | Abre Docker Desktop → `docker compose up -d` (los datos se conservan) |
| Apagar | `docker compose down` (sin `-v`) |
| Empezar de cero con los datos de prueba | `docker compose down -v` → `docker compose up -d` → `./scripts/cargar-datos-demo.sh` |
| Traer cambios de GitHub | `git pull` → `docker compose up -d --build` |
| Ver errores de un servicio | `docker compose logs -f prestamos` |

## Si algo falla

| Problema | Solución |
|---|---|
| La app dice "No hay conexión con la biblioteca (http://…)" | USB: repite `adb reverse tcp:8080 tcp:8080`. Wi-Fi: revisa la IP, que la red sea *Privada* y la regla del firewall |
| "Probar y guardar" dice que no responde | Desde Chrome del teléfono abre `http://<servidor>/health`. Si tampoco abre, el problema es la red o el firewall, no la app |
| `adb` dice *unauthorized* | Desbloquea el teléfono y acepta el aviso de depuración USB |
| `adb` dice *no devices* | Usa un cable de datos (no solo de carga) y en el teléfono elige el modo USB *Transferir archivos* |
| El puerto 8080 está ocupado | `netstat -ano \| findstr :8080` y cierra ese programa |
| Un contenedor se reinicia una y otra vez | `docker compose logs <servicio>` y manda el error |
