// Package seguridad verifica localmente el JWT HS256 emitido por Usuarios (D2).
// Se implementa con la biblioteca estándar para no depender de paquetes externos.
package seguridad

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

var (
	ErrFormato = errors.New("token con formato inválido")
	ErrFirma   = errors.New("firma inválida")
	ErrExpirad = errors.New("token expirado")
	ErrAlg     = errors.New("algoritmo no permitido")
)

// Sesion es la identidad de quien hace la petición.
type Sesion struct {
	IDUsuario string
	Rol       string
	Interno   bool // llamada de otro microservicio con X-Service-Token
}

func (s Sesion) EsStaff() bool {
	return s.Interno || s.Rol == "BIBLIOTECARIO" || s.Rol == "ADMIN"
}

func (s Sesion) Autenticada() bool { return s.Interno || s.IDUsuario != "" }

// VerificarJWT valida firma HS256 y expiración, y devuelve la sesión (sub, rol).
func VerificarJWT(token, secreto string, ahora time.Time) (Sesion, error) {
	partes := strings.Split(token, ".")
	if len(partes) != 3 {
		return Sesion{}, ErrFormato
	}
	var cab struct {
		Alg string `json:"alg"`
	}
	if err := decodificar(partes[0], &cab); err != nil {
		return Sesion{}, ErrFormato
	}
	if cab.Alg != "HS256" { // impide el ataque "alg: none"
		return Sesion{}, ErrAlg
	}
	mac := hmac.New(sha256.New, []byte(secreto))
	mac.Write([]byte(partes[0] + "." + partes[1]))
	firma, err := base64.RawURLEncoding.DecodeString(partes[2])
	if err != nil || !hmac.Equal(firma, mac.Sum(nil)) {
		return Sesion{}, ErrFirma
	}
	var c struct {
		Sub string   `json:"sub"`
		Rol string   `json:"rol"`
		Exp *float64 `json:"exp"`
	}
	if err := decodificar(partes[1], &c); err != nil || c.Sub == "" {
		return Sesion{}, ErrFormato
	}
	if c.Exp == nil || float64(ahora.Unix()) >= *c.Exp {
		return Sesion{}, ErrExpirad
	}
	return Sesion{IDUsuario: c.Sub, Rol: c.Rol}, nil
}

func decodificar(parte string, destino any) error {
	b, err := base64.RawURLEncoding.DecodeString(parte)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, destino)
}

// FirmarJWT genera un token HS256; se usa en pruebas y herramientas de desarrollo.
func FirmarJWT(sub, rol, secreto string, exp time.Time) string {
	cab := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	cuerpo, _ := json.Marshal(map[string]any{"sub": sub, "rol": rol, "exp": exp.Unix(), "iat": exp.Add(-time.Hour).Unix()})
	p := base64.RawURLEncoding.EncodeToString(cuerpo)
	mac := hmac.New(sha256.New, []byte(secreto))
	mac.Write([]byte(cab + "." + p))
	return cab + "." + p + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
