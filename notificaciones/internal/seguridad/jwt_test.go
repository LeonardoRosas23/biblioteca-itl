package seguridad

import (
	"encoding/base64"
	"strings"
	"testing"
	"time"
)

const secreto = "secreto-de-pruebas-con-al-menos-32-bytes!!"

var ahora = time.Date(2026, 11, 4, 12, 0, 0, 0, time.UTC)

func TestTokenValido(t *testing.T) {
	tok := FirmarJWT("U123", "ALUMNO", secreto, ahora.Add(time.Hour))
	s, err := VerificarJWT(tok, secreto, ahora)
	if err != nil || s.IDUsuario != "U123" || s.Rol != "ALUMNO" || s.EsStaff() {
		t.Fatalf("sesión inesperada %+v, err %v", s, err)
	}
}

// Token real generado con jsonwebtoken (la biblioteca del MS Usuarios en Node) con el mismo secreto.
const tokenDeNode = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2wiOiJCSUJMSU9URUNBUklPIiwiaWF0IjoxNzkzODMyOTczLCJleHAiOjIxMDkxOTI5NzMsInN1YiI6IlUxMDAifQ.49kHiQDRbAzuap9uxyJabMq-nk5UayZRDoyp50GWv7g"

func TestCompatibleConTokenDeNode(t *testing.T) {
	s, err := VerificarJWT(tokenDeNode, secreto, ahora)
	if err != nil || s.IDUsuario != "U100" || !s.EsStaff() {
		t.Fatalf("el token emitido por Usuarios debe verificarse: %+v %v", s, err)
	}
}

func TestErrores(t *testing.T) {
	valido := FirmarJWT("U123", "ALUMNO", secreto, ahora.Add(time.Hour))
	partes := strings.Split(valido, ".")
	none := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"none"}`)) + "." + partes[1] + "."
	casos := map[string]struct {
		token string
		err   error
	}{
		"otro secreto":    {FirmarJWT("U1", "ALUMNO", "otro-secreto-distinto-de-32-bytes!!!!", ahora.Add(time.Hour)), ErrFirma},
		"expirado":        {FirmarJWT("U1", "ALUMNO", secreto, ahora.Add(-time.Second)), ErrExpirad},
		"alterado":        {partes[0] + "." + partes[1] + "x." + partes[2], ErrFirma},
		"alg none":        {none, ErrAlg},
		"basura":          {"no-es-un-jwt", ErrFormato},
		"firma no base64": {partes[0] + "." + partes[1] + ".***", ErrFirma},
	}
	for nombre, c := range casos {
		t.Run(nombre, func(t *testing.T) {
			if _, err := VerificarJWT(c.token, secreto, ahora); err != c.err {
				t.Fatalf("esperaba %v, obtuve %v", c.err, err)
			}
		})
	}
}

func TestSesionInternaEsStaff(t *testing.T) {
	if !(Sesion{Interno: true}).EsStaff() || !(Sesion{Interno: true}).Autenticada() {
		t.Fatal("una llamada interna debe considerarse autenticada y con privilegios")
	}
	if (Sesion{}).Autenticada() {
		t.Fatal("una sesión vacía no está autenticada")
	}
}
