# Despliegue gratuito en Azure for Students + APK de Android

Resultado final:

- El sistema completo en línea en `https://<tu-nombre>.<región>.cloudapp.azure.com`, con certificado HTTPS real.
- La app instalada en cualquier Android a partir de un APK que se descarga de la página de Releases de GitHub.

Necesitas tu correo institucional (@itleon.edu.mx) y la cuenta de GitHub del repositorio. No se necesita tarjeta.

## Costos: por qué no te pueden cobrar

| Concepto | Detalle |
|---|---|
| **Crédito** | Azure for Students da **100 USD para usar en 12 meses, sin tarjeta**. Si se acaba el crédito, la suscripción **se desactiva**; solo pasaría a un plan de pago si tú lo pides a soporte |
| **Servidor recomendado** | **B2ps v2** (2 núcleos ARM, 8 GB): unos 33 USD al mes encendido todo el tiempo. Alternativa: **B2s** o **B2ls v2** (2 núcleos x64, 4 GB): unos 30 USD al mes |
| **Disco e IP pública** | Unos 6 USD al mes en total (disco *Standard SSD* de 30 GB e IP fija) |
| **Cuánto alcanza** | Encendido 24/7, unos 2.5 meses. Si lo **detienes** cuando no se usa (botón *Stop*), el servidor deja de cobrar y el crédito dura mucho más |
| **DuckDNS** | No hace falta: Azure da un dominio gratuito `*.cloudapp.azure.com` |
| **GitHub Actions y Releases** | Gratis en repositorios públicos |

**Para ver cuánto crédito te queda:** portal de Azure → busca **Education** → *Overview*, o **Cost Management**.

---

## 1. Activar Azure for Students (≈ 10 min)

1. Entra a **azure.microsoft.com/free/students** → **Start free**.
2. Inicia sesión con tu correo **@itleon.edu.mx**. Si el Tecnológico usa Microsoft 365, es la misma contraseña de tu correo institucional.
3. Completa la verificación de estudiante y tu teléfono. **No pide tarjeta.**
4. Al terminar entras al **portal de Azure** (portal.azure.com) con una suscripción llamada **Azure for Students**.

## 2. Ver en qué regiones te deja crear servidores

Las cuentas de estudiante solo pueden crear recursos en unas **5 regiones**, y **la lista cambia de una persona a otra**. Revísala antes de crear el servidor:

1. En el buscador de arriba del portal escribe **Policy** → ábrelo.
2. Menú izquierdo → **Assignments** → abre **Allowed resource deployment regions**.
3. En **Parameters** verás la lista de regiones permitidas. Elige la más cercana. En orden de preferencia: *Mexico Central*, *South Central US*, *West US 2/3*, *East US*, *Central US*.

Si la lista sale vacía o todas las regiones fallan, abre una solicitud gratuita en **Help + support** pidiendo que habiliten una región para tu suscripción de estudiante.

## 3. Crear el servidor (≈ 10 min)

Portal → **Virtual machines** → **Create** → **Azure virtual machine**.

**Pestaña Basics:**

| Campo | Valor |
|---|---|
| Subscription | Azure for Students |
| Resource group | **Create new** → `biblioteca-itl` |
| Virtual machine name | `biblioteca-itl` |
| Region | Una de la lista del paso 2 |
| Availability options | *No infrastructure redundancy required* |
| Security type | *Standard* |
| Image | **Ubuntu Server 24.04 LTS** |
| VM architecture | **Arm64** para el B2ps v2, o **x64** para el B2s / B2ls v2 |
| Size | **See all sizes** → busca `B2ps_v2`. Si no está disponible: x64 con `B2s` o `B2ls_v2` |
| Authentication type | **SSH public key** |
| Username | `azureuser` |
| SSH public key source | **Generate new key pair** · Key pair name `biblioteca-itl` |
| Public inbound ports | **Allow selected ports** → marca **SSH (22)**, **HTTP (80)** y **HTTPS (443)** |

**Pestaña Disks:** *OS disk type* → **Standard SSD**, que es más barato que Premium. Deja marcado *Delete with VM*.

**Pestaña Management (opcional, para ahorrar crédito):** *Auto-shutdown* → **Enable**, a las 23:30, zona *(UTC-06:00) Guadalajara, Mexico City*. El servidor se apaga cada noche y lo enciendes con **Start** cuando lo necesites.

**Review + create** → **Create** → **Download private key and create resource**.

Guarda el archivo `biblioteca-itl.pem` en `C:\Users\TU-USUARIO\.ssh\`.

> Si al crear aparece **RequestDisallowedByAzure**, la región elegida no está permitida: vuelve al paso 2 y usa otra.

## 4. Ponerle nombre al servidor (≈ 2 min)

1. Cuando termine, **Go to resource**.
2. En *Overview*, junto a **DNS name**, haz clic en **Not configured** (o *Configure*).
3. En **DNS name label** escribe un nombre, por ejemplo `bibliotecaitl` → **Save**.
4. Tu dirección queda como `bibliotecaitl.<región>.cloudapp.azure.com`, por ejemplo `bibliotecaitl.mexicocentral.cloudapp.azure.com`. Cópiala completa: es **TU-DOMINIO** en los pasos siguientes.

## 5. Entrar al servidor desde Windows

En PowerShell:

```powershell
# Solo la primera vez: Windows exige que la llave sea privada
icacls "$env:USERPROFILE\.ssh\biblioteca-itl.pem" /inheritance:r /grant:r "$($env:USERNAME):(R)"

ssh -i "$env:USERPROFILE\.ssh\biblioteca-itl.pem" azureuser@TU-DOMINIO
```

Responde `yes` la primera vez.

## 6. Instalar el sistema (dentro del servidor, ≈ 15–20 min)

```bash
git clone https://github.com/LeonardoRosas23/biblioteca-itl.git
cd biblioteca-itl
bash deploy/instalar.sh TU-DOMINIO
```

El script hace lo siguiente:

1. Instala Docker y agrega 2 GB de memoria de intercambio.
2. Crea un `.env` con contraseñas al azar.
3. Construye y levanta los 11 contenedores, con Caddy para el HTTPS.
4. Carga los datos de demostración.

Termina con **"Listo."** y muestra la **contraseña de las cuentas de prueba**. También queda en `~/credenciales-biblioteca.txt`; para verla después: `cat ~/credenciales-biblioteca.txt`.

Abre `https://TU-DOMINIO` en tu navegador: debe cargar el panel con el candado de HTTPS. La primera vez, el certificado puede tardar 1 o 2 minutos.

## 7. Generar e instalar la app en tu Android

1. En GitHub → repositorio → **Actions** → **APK Android** → **Run workflow**.
2. En *api_url* escribe `https://TU-DOMINIO`, sin barra al final → **Run workflow**. Espera la palomita verde, unos 6 a 10 minutos.
3. **En el teléfono**, abre en Chrome **github.com/LeonardoRosas23/biblioteca-itl/releases** → **App Android** → toca `biblioteca-itl.apk`.
4. Abre la descarga → **Instalar**.
   - Si no se permite: **Configuración → Instalar apps desconocidas → Chrome → Permitir**.
   - Si Play Protect advierte: **Más detalles → Instalar de todas formas**.

Si algún día cambia la dirección del servidor, vuelve a correr **APK Android** con la nueva e instala el APK encima del anterior.

## 8. Uso diario

| Acción | Cómo |
|---|---|
| **Apagar** para ahorrar crédito | Portal → la VM → **Stop**. Detenida, la VM no se cobra; solo el disco y la IP, unos centavos al día |
| **Encender** | Portal → la VM → **Start**. A los 2 o 3 minutos el sistema arranca solo, con los datos intactos |
| **Actualizar** tras cambios en GitHub | `ssh …` → `cd biblioteca-itl && bash deploy/actualizar.sh` |
| **Ver registros** | `sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f prestamos` |
| **Ver el crédito** | Portal → **Education** o **Cost Management** |

**Antes de cada presentación:** enciende la VM unos 10 minutos antes y abre `https://TU-DOMINIO` para confirmar que responde.

## Si algo falla

| Problema | Solución |
|---|---|
| `RequestDisallowedByAzure` | Región no permitida: paso 2 |
| El tamaño B2ps v2 no aparece | Cambia *VM architecture* a x64 y usa B2s o B2ls v2 |
| `Permission denied (publickey)` | El usuario es `azureuser`; revisa la ruta del `.pem` y el comando `icacls` |
| La página no abre | En la VM → **Networking** → confirma reglas de entrada para 80 y 443 |
| Error de certificado | Espera 2 minutos o revisa con `sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml logs caddy` |
| La app no conecta | El APK debe haberse generado con tu dirección exacta, con `https://` |
| El servidor se quedó sin memoria (x64 de 4 GB) | `sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml restart prestamos`. Si se repite, avísame para limitar la memoria de Java |
