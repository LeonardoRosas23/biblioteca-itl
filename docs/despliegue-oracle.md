# Alternativa: despliegue gratuito en Oracle Cloud + DuckDNS

> La opción principal es Azure for Students ([`despliegue.md`](despliegue.md)). Esta guía queda por si más adelante se puede crear la cuenta de Oracle (la verificación de tarjeta suele fallar).

Resultado final:

- El sistema completo en línea las 24 horas en `https://<tu-dominio>.duckdns.org`, con certificado HTTPS real.
- La app instalada en cualquier Android a partir de un APK que se descarga de la página de Releases de GitHub.

Todo es gratuito. Necesitas: una cuenta de Oracle Cloud (pide tarjeta solo para verificar identidad), una cuenta de DuckDNS (entras con GitHub o Google) y el repositorio en GitHub.

> **Límites de la capa gratuita de Oracle.** Desde el 15 de junio de 2026, las cuentas gratuitas tienen hasta **2 OCPU y 12 GB de RAM** en instancias Ampere A1 (antes eran 4 y 24). Alcanza de sobra para este sistema. No pidas más de eso: si te pasas del límite gratuito, Oracle apaga las instancias.

## Costos: por qué es gratis y cómo asegurarte de que no te cobren

| Servicio | Por qué no cuesta | Lo único que NO debes hacer |
|---|---|---|
| **Oracle Cloud** | Oracle no cobra la tarjeta a menos que actualices la cuenta. Si una cuenta gratuita pasa del límite, Oracle **apaga** las instancias Ampere en lugar de cobrarlas | **Nunca** presiones *Upgrade to Pay As You Go*. Crea **solo** una instancia A1 de 2 OCPU y 12 GB con el disco de 47 GB que viene por defecto. Durante los primeros 30 días de prueba la consola te deja crear cosas más grandes con el crédito de regalo; no lo hagas, porque al terminar la prueba se eliminan |
| **GitHub Actions** | Gratis en repositorios **públicos** con los runners estándar (`ubuntu-latest`), que son los que usa este proyecto | No vuelvas privado el repositorio sin revisar el plan. No agregues un método de pago: sin él, si algo excediera la cuota, GitHub lo **bloquea** en lugar de cobrarlo |
| **Releases de GitHub** (el APK) | Gratis | — |
| **DuckDNS** y **Let's Encrypt** | Servicios gratuitos | — |
| **APK de Android** | Se instala directo (sin Play Store, que sí cobra el registro de desarrollador) | — |

Para revisar en cualquier momento que vas en $0:
- **Oracle:** ☰ → *Billing & Cost Management* → *Cost Analysis*. También puedes crear un *Budget* de $1 USD con alerta por correo.
- **GitHub:** tu foto → *Settings* → *Billing and licensing*.

---

## 1. Crear la cuenta de Oracle Cloud

1. Entra a **cloud.oracle.com/free** → *Start for free*.
2. Llena tus datos y verifica la tarjeta. Oracle hace un cargo temporal de verificación que luego devuelve.
3. **Región de inicio (home region):** elige *Mexico Central (Querétaro)* o *Mexico Northeast (Monterrey)*. **No se puede cambiar después.**
4. Espera el correo de "Your account is ready" y entra a la consola.
5. Si en algún momento la consola te ofrece **Upgrade** o **Pay As You Go**, ignóralo: la cuenta gratuita es todo lo que necesitas.

## 2. Crear el servidor (instancia)

1. Menú ☰ → **Compute → Instances → Create instance**.
2. **Name:** `biblioteca-itl`.
3. **Image and shape → Edit:**
   - *Image:* **Canonical Ubuntu 24.04**.
   - *Shape:* **Ampere → VM.Standard.A1.Flex**, con **2 OCPU y 12 GB** de memoria.
4. **Networking:**
   - Deja *Create new virtual cloud network* y *Create new public subnet*.
   - Confirma que **Assign a public IPv4 address** esté activado.
5. **Add SSH keys:** *Generate a key pair for me* → **Save private key**. Guárdala en `C:\Users\<tú>\.ssh\oracle-biblioteca.key`.
6. **Create.** En uno o dos minutos queda en verde (*Running*). Copia la **Public IP address**.

> Si aparece **"Out of capacity"**, no hay servidores Ampere libres en ese momento. Vuelve a intentarlo más tarde, o cambia de *Availability domain* en el mismo formulario. No uses la forma *E2.1.Micro*: con 1 GB no alcanza para este sistema.

## 3. Abrir los puertos 80 y 443 en Oracle

1. En la página de la instancia → **Primary VNIC → Subnet** (el enlace) → **Security Lists** → *Default Security List…*
2. **Add Ingress Rules**, dos veces:
   - Source CIDR `0.0.0.0/0`, IP Protocol **TCP**, Destination port **80**.
   - Source CIDR `0.0.0.0/0`, IP Protocol **TCP**, Destination port **443**.

El firewall interno del servidor lo abre el script de instalación.

## 4. Crear tu dominio gratuito en DuckDNS

1. Entra a **duckdns.org** e inicia sesión con GitHub o Google.
2. En *sub domain* escribe un nombre (por ejemplo `bibliotecaitl`) → **add domain**.
3. En el campo **current ip** de ese dominio pega la IP pública de tu instancia → **update ip**.

Tu dirección será `https://bibliotecaitl.duckdns.org`.

## 5. Entrar al servidor desde Windows

En PowerShell:

```powershell
# Solo la primera vez: Windows exige que la llave sea privada
icacls "$env:USERPROFILE\.ssh\oracle-biblioteca.key" /inheritance:r /grant:r "$($env:USERNAME):(R)"

ssh -i "$env:USERPROFILE\.ssh\oracle-biblioteca.key" ubuntu@<IP-PÚBLICA>
```

Responde `yes` la primera vez. Ya estás dentro del servidor.

## 6. Instalar el sistema (dentro del servidor)

```bash
git clone https://github.com/<tu-usuario>/<tu-repositorio>.git biblioteca-itl
cd biblioteca-itl
bash deploy/instalar.sh bibliotecaitl.duckdns.org
```

El script hace lo siguiente:

1. Instala Docker.
2. Abre los puertos 80 y 443 en el firewall del servidor.
3. Crea un `.env` con contraseñas al azar.
4. Construye y levanta los 11 contenedores (los 10 del sistema más Caddy, que pone el HTTPS). La primera vez tarda unos 10 a 15 minutos.
5. Carga los datos de demostración.

Al final muestra la **contraseña de las cuentas de prueba**. También queda en `~/credenciales-biblioteca.txt`; para verla después: `cat ~/credenciales-biblioteca.txt`.

Abre `https://bibliotecaitl.duckdns.org` en tu navegador: debe cargar el panel con el candado de HTTPS.

**Comandos útiles en el servidor:**

```bash
cd ~/biblioteca-itl
bash deploy/actualizar.sh                       # traer cambios de GitHub y reconstruir
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml ps        # estado
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f prestamos   # registros
```

## 7. Generar e instalar la app en tu Android (Galaxy S23)

1. En GitHub, en tu repositorio → pestaña **Actions** → **APK Android** (a la izquierda) → **Run workflow**.
2. En *api_url* escribe `https://bibliotecaitl.duckdns.org` → **Run workflow**. Tarda unos 15 a 25 minutos.
3. Cuando termine, ve a la página **Releases** del repositorio (columna derecha de la portada) → **App Android** → `biblioteca-itl.apk`.
4. **En el S23**, abre esa página de Releases en Chrome, toca `biblioteca-itl.apk` y descárgalo.
5. Toca la notificación de descarga → **Instalar**. La primera vez Android pide permiso:
   - *Configuración → Permitir desde esta fuente* (Chrome) → regresa e instala.
   - Si Play Protect advierte que la app es desconocida → **Más detalles → Instalar de todas formas**. Es normal en apps que no vienen de Play Store.
6. Abre **Biblioteca ITL**, regístrate o entra con una cuenta de prueba.

Cada vez que cambie la app, vuelve a correr el flujo **APK Android** e instala el nuevo APK encima del anterior (conserva la sesión).

## 8. Pruebas automáticas en GitHub

Cada `push` a `main` corre el flujo **Pruebas** (pestaña *Actions*):

- Las pruebas de los seis componentes: Jest, pytest con PostgreSQL, `mvn test`, `go test -race`, Vitest y Jest de la app.
- El sistema completo con Docker: integración front–back del panel y de la app, la prueba de punta a punta PI01–PI19 y la prueba de carga RNF05.

En cada ejecución, la sección *Artifacts* tiene los reportes de JUnit y JaCoCo de Préstamos y el reporte `e2e_gateway.txt`. Descárgalos como evidencia de las entregas.

## Seguridad del servidor público

- El `.env` del servidor nunca se sube a GitHub (está en `.gitignore`), y todas sus contraseñas son aleatorias.
- Las cuentas de prueba usan la contraseña aleatoria de `SEED_PASSWORD`, no la de desarrollo. Compártela solo con el equipo y el profesor.
- Las bases de datos no se exponen a Internet; solo Caddy escucha en 80 y 443.
- Si quieres desactivar el registro abierto de alumnos, pon `DOMINIO_CORREO=itleon.edu.mx` (ya viene así): solo se aceptan correos institucionales.
