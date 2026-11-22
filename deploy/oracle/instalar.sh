#!/usr/bin/env bash
# Instala Biblioteca ITL en un servidor Ubuntu (probado para Oracle Cloud Always Free, Ampere A1).
#
#   git clone https://github.com/<usuario>/<repositorio>.git biblioteca-itl
#   cd biblioteca-itl
#   bash deploy/oracle/instalar.sh bibliotecaitl.duckdns.org
#
# Hace: instala Docker, abre los puertos 80 y 443 del firewall del servidor, crea un .env con
# secretos al azar, levanta todo con HTTPS y carga los datos de demostración.
# Se puede volver a correr: no cambia los secretos de un .env que ya existe.
set -euo pipefail
cd "$(dirname "$0")/../.."

DOMINIO="${1:-}"
if [ -z "$DOMINIO" ]; then
  echo "Uso: bash deploy/oracle/instalar.sh <tu-dominio>   (p. ej. bibliotecaitl.duckdns.org)" >&2
  exit 1
fi
paso() { printf '\n\033[1;34m== %s\033[0m\n' "$*"; }

paso "1/6 Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER" || true
fi
sudo docker compose version

paso "2/6 Memoria de intercambio (ayuda a compilar Java)"
if [ "$(swapon --noheadings | wc -l)" -eq 0 ]; then
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi
free -h | head -2

paso "3/6 Firewall del servidor: puertos 80 y 443"
# Las imágenes de Ubuntu de Oracle traen reglas iptables que rechazan todo salvo SSH.
for puerto in 80 443; do
  sudo iptables -C INPUT -p tcp --dport "$puerto" -m conntrack --ctstate NEW -j ACCEPT 2>/dev/null \
    || sudo iptables -I INPUT 1 -p tcp --dport "$puerto" -m conntrack --ctstate NEW -j ACCEPT
done
if command -v netfilter-persistent >/dev/null; then sudo netfilter-persistent save >/dev/null; fi
echo "Recuerda abrir también 80 y 443 en la Security List de la VCN (consola de Oracle)."

paso "4/6 Configuración (.env)"
if [ ! -f .env ]; then
  cp .env.example .env
  al_azar() { openssl rand -hex "$1"; }
  sed -i \
    -e "s|^JWT_SECRET=.*|JWT_SECRET=$(al_azar 32)|" \
    -e "s|^SERVICE_TOKEN=.*|SERVICE_TOKEN=$(al_azar 16)|" \
    -e "s|^PASS_USUARIOS=.*|PASS_USUARIOS=$(al_azar 16)|" \
    -e "s|^PASS_CATALOGO=.*|PASS_CATALOGO=$(al_azar 16)|" \
    -e "s|^PASS_PRESTAMOS=.*|PASS_PRESTAMOS=$(al_azar 16)|" \
    -e "s|^PASS_NOTIFICACIONES=.*|PASS_NOTIFICACIONES=$(al_azar 16)|" \
    -e "s|^HOST_PUBLICO=.*|HOST_PUBLICO=$DOMINIO|" \
    -e "s|^SEED_PASSWORD=.*|SEED_PASSWORD=Itl-$(al_azar 4)|" \
    .env
  echo "DOMINIO=$DOMINIO" >> .env
  chmod 600 .env
  echo "Se creó .env con secretos nuevos."
else
  grep -q '^DOMINIO=' .env || echo "DOMINIO=$DOMINIO" >> .env
  sed -i "s|^DOMINIO=.*|DOMINIO=$DOMINIO|" .env
  echo "Se conserva el .env existente."
fi

DC="sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml"

paso "5/6 Construir y levantar (la primera vez tarda varios minutos)"
$DC up -d --build
for i in $(seq 1 90); do
  codigo=$($DC exec -T gateway wget -q -O /dev/null -S http://prestamos:8080/actuator/health 2>&1 | awk '/HTTP\//{print $2}' | tail -1 || true)
  [ "$codigo" = "200" ] && break
  sleep 3
done

paso "6/6 Datos de demostración"
DC="$DC" ./scripts/cargar-datos-demo.sh

CLAVE=$(grep '^SEED_PASSWORD=' .env | cut -d= -f2-)
cat > "$HOME/credenciales-biblioteca.txt" <<FIN
Biblioteca ITL · https://$DOMINIO
Cuentas de prueba: admin@itleon.edu.mx, biblioteca@itleon.edu.mx,
ana.alumna@itleon.edu.mx, beto.alumno@itleon.edu.mx, carla.profe@itleon.edu.mx
Contraseña de todas: $CLAVE
FIN
chmod 600 "$HOME/credenciales-biblioteca.txt"

printf '\n\033[1;32mListo.\033[0m\n'
echo "Panel:      https://$DOMINIO   (el certificado puede tardar 1 o 2 minutos la primera vez)"
echo "API:        https://$DOMINIO/api/v1/..."
echo "Contraseña de las cuentas de prueba: $CLAVE   (guardada en ~/credenciales-biblioteca.txt)"
