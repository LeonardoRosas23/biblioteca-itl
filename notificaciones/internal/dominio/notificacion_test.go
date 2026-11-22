package dominio

import (
	"strings"
	"testing"
	"time"
)

var t0 = time.Date(2026, 11, 4, 12, 0, 0, 0, time.UTC)

func TestValidar(t *testing.T) {
	casos := []struct {
		nombre    string
		usuario   string
		tipo      Tipo
		mensaje   string
		problemas int
	}{
		{"válido", "U123", Confirmacion, "Tu solicitud fue registrada.", 0},
		{"vencimiento es un tipo válido", "U123", Vencimiento, "Vencido", 0},
		{"sin usuario", " ", Recordatorio, "x", 1},
		{"tipo desconocido", "U123", Tipo("SPAM"), "x", 1},
		{"mensaje vacío", "U123", AlertaMulta, "   ", 1},
		{"mensaje largo", "U123", AlertaMulta, strings.Repeat("ñ", 501), 1},
		{"todo mal", "", "", "", 3},
	}
	for _, c := range casos {
		t.Run(c.nombre, func(t *testing.T) {
			if got := Validar(c.usuario, c.tipo, c.mensaje); len(got) != c.problemas {
				t.Fatalf("esperaba %d problemas, obtuve %v", c.problemas, got)
			}
		})
	}
}

func TestMensajeDe500CaracteresConAcentosEsValido(t *testing.T) {
	if p := Validar("U1", Confirmacion, strings.Repeat("á", 500)); len(p) != 0 {
		t.Fatalf("500 runas deben aceptarse: %v", p)
	}
}

func TestRetrocesoExponencial(t *testing.T) {
	n := &Notificacion{Estado: Pendiente}
	esperas := []time.Duration{30 * time.Second, 60 * time.Second, 120 * time.Second, 240 * time.Second}
	for i, e := range esperas {
		n.RegistrarFallo("smtp caído", t0, 5)
		if n.Estado != Fallida || n.Intentos != i+1 {
			t.Fatalf("intento %d: estado %s intentos %d", i+1, n.Estado, n.Intentos)
		}
		if got := n.ProximoReintento.Sub(t0); got != e {
			t.Fatalf("intento %d: espera %v, esperaba %v", i+1, got, e)
		}
	}
}

func TestAgotarIntentosDejaDeReintentar(t *testing.T) {
	n := &Notificacion{Estado: Pendiente}
	for i := 0; i < 3; i++ {
		n.RegistrarFallo("x", t0, 3)
	}
	if n.ProximoReintento != nil {
		t.Fatal("al agotar intentos no debe haber próximo reintento")
	}
	if n.DebeReintentarse(t0.Add(time.Hour)) {
		t.Fatal("no debe reintentarse después de agotar intentos")
	}
}

func TestRecortaElError(t *testing.T) {
	n := &Notificacion{}
	n.RegistrarFallo(strings.Repeat("é", 1000), t0, 5)
	if len([]rune(*n.UltimoError)) != MaxError {
		t.Fatalf("el error debe recortarse a %d runas", MaxError)
	}
}

func TestDebeReintentarse(t *testing.T) {
	n := &Notificacion{Estado: Pendiente}
	if !n.DebeReintentarse(t0) {
		t.Fatal("una pendiente se procesa de inmediato")
	}
	n.RegistrarFallo("x", t0, 5)
	if n.DebeReintentarse(t0.Add(10 * time.Second)) {
		t.Fatal("antes de 30 s no se reintenta")
	}
	if !n.DebeReintentarse(t0.Add(30 * time.Second)) {
		t.Fatal("a los 30 s sí se reintenta")
	}
	n.MarcarEnviada(t0)
	if n.DebeReintentarse(t0.Add(time.Hour)) || n.UltimoError != nil || n.FechaEnvio == nil {
		t.Fatal("una enviada no se reintenta y limpia el error")
	}
}
