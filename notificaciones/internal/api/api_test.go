package api_test

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/itl/biblioteca/notificaciones/internal/almacen/memoria"
	"github.com/itl/biblioteca/notificaciones/internal/api"
	"github.com/itl/biblioteca/notificaciones/internal/seguridad"
	"github.com/itl/biblioteca/notificaciones/internal/servicio"
)

const secreto = "secreto-de-pruebas-con-al-menos-32-bytes!!"

var ahora = time.Date(2026, 11, 4, 12, 0, 0, 0, time.UTC)

func app() *testApp {
	svc := servicio.Nuevo(memoria.Nuevo(), servicio.CanalApp{}, func() time.Time { return ahora }, 3)
	return &testApp{api.NuevaApp(svc, api.Config{JWTSecret: secreto, ServiceToken: "interno", Reloj: func() time.Time { return ahora }})}
}

type testApp struct {
	a interface {
		Test(*http.Request, ...int) (*http.Response, error)
	}
}

func (t *testApp) do(metodo, ruta, cuerpo string, cab map[string]string) (int, map[string]any) {
	var r io.Reader
	if cuerpo != "" {
		r = strings.NewReader(cuerpo)
	}
	req := httptest.NewRequest(metodo, ruta, r)
	req.Header.Set("Content-Type", "application/json")
	for k, v := range cab {
		req.Header.Set(k, v)
	}
	res, err := t.a.Test(req, -1)
	if err != nil {
		panic(err)
	}
	var m map[string]any
	_ = json.NewDecoder(res.Body).Decode(&m)
	return res.StatusCode, m
}

func bearer(sub, rol string) map[string]string {
	return map[string]string{"Authorization": "Bearer " + seguridad.FirmarJWT(sub, rol, secreto, ahora.Add(time.Hour))}
}

var interno = map[string]string{"X-Service-Token": "interno", "Idempotency-Key": "CONFIRMACION:P-0101"}

const aviso = `{"idUsuario":"U123","idPrestamo":"P-0101","tipo":"CONFIRMACION","mensaje":"Tu solicitud fue registrada."}`

func TestCrearAvisoContrato(t *testing.T) {
	a := app()
	st, m := a.do("POST", "/api/v1/notificaciones", aviso, interno)
	if st != 201 || m["idNotificacion"] != "N-0001" || m["estado"] != "ENVIADA" {
		t.Fatalf("esperaba 201 y N-0001: %d %v", st, m)
	}
	st, m = a.do("POST", "/api/v1/notificaciones", aviso, interno)
	if st != 200 || m["idNotificacion"] != "N-0001" {
		t.Fatalf("repetir con la misma Idempotency-Key debe devolver 200 y el mismo aviso: %d %v", st, m)
	}
}

func TestErroresConFormatoComun(t *testing.T) {
	a := app()
	st, m := a.do("POST", "/api/v1/notificaciones", `{"idUsuario":""}`, map[string]string{"X-Service-Token": "interno", "X-Correlation-Id": "abc"})
	if st != 400 || m["codigo"] != "DATOS_INVALIDOS" || m["correlacionId"] != "abc" {
		t.Fatalf("400 con formato común: %d %v", st, m)
	}
	if st, _ := a.do("POST", "/api/v1/notificaciones", "{malo", map[string]string{"X-Service-Token": "interno"}); st != 400 {
		t.Fatalf("JSON roto → 400, obtuve %d", st)
	}
	if st, m := a.do("GET", "/api/v1/notificaciones", "", nil); st != 401 || m["codigo"] != "NO_AUTENTICADO" {
		t.Fatalf("sin credenciales → 401: %d", st)
	}
	if st, _ := a.do("GET", "/api/v1/notificaciones", "", map[string]string{"Authorization": "Bearer x.y.z"}); st != 401 {
		t.Fatal("token inválido → 401")
	}
	if st, _ := a.do("POST", "/api/v1/notificaciones", aviso, bearer("U900", "BIBLIOTECARIO")); st != 403 {
		t.Fatal("un usuario no crea avisos → 403")
	}
}

func TestBandejaDelUsuario(t *testing.T) {
	a := app()
	a.do("POST", "/api/v1/notificaciones", aviso, interno)
	st, m := a.do("GET", "/api/v1/notificaciones", "", bearer("U123", "ALUMNO"))
	if st != 200 || m["total"].(float64) != 1 {
		t.Fatalf("Ana ve su aviso: %d %v", st, m)
	}
	_, m = a.do("GET", "/api/v1/notificaciones", "", bearer("U124", "ALUMNO"))
	if m["total"].(float64) != 0 {
		t.Fatal("Beto no ve avisos ajenos")
	}
	if st, _ := a.do("GET", "/api/v1/notificaciones/N-0001", "", bearer("U124", "ALUMNO")); st != 403 {
		t.Fatal("detalle ajeno → 403")
	}
	if st, m := a.do("PATCH", "/api/v1/notificaciones/N-0001/leida", "", bearer("U123", "ALUMNO")); st != 200 || m["leida"] != true {
		t.Fatalf("marcar leída: %d %v", st, m)
	}
	if st, _ := a.do("GET", "/api/v1/notificaciones/N-9999", "", bearer("U900", "BIBLIOTECARIO")); st != 404 {
		t.Fatal("inexistente → 404")
	}
}
