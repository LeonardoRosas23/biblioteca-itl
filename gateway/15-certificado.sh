#!/bin/sh
# Si no hay certificado en /etc/nginx/certs (montado desde gateway/certs/), genera uno autofirmado
# válido para localhost, 127.0.0.1 y el nombre o IP indicado en HOST_PUBLICO.
set -e
DIR=/etc/nginx/certs
if [ -s "$DIR/servidor.crt" ] && [ -s "$DIR/servidor.key" ]; then
  echo "certificado: se usa el de $DIR"
  exit 0
fi
SAN="DNS:localhost,IP:127.0.0.1"
if [ -n "$HOST_PUBLICO" ]; then
  case "$HOST_PUBLICO" in
    *[!0-9.]*) SAN="$SAN,DNS:$HOST_PUBLICO" ;;
    *)         SAN="$SAN,IP:$HOST_PUBLICO" ;;
  esac
fi
echo "certificado: generando uno autofirmado para $SAN"
openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
  -subj "/CN=${HOST_PUBLICO:-localhost}/O=Biblioteca ITL" \
  -addext "subjectAltName=$SAN" \
  -keyout "$DIR/servidor.key" -out "$DIR/servidor.crt" 2>/dev/null
chmod 600 "$DIR/servidor.key"
