// Package dominio contiene la entidad Notificación y sus reglas, sin dependencias externas.
package dominio

import (
	"strings"
	"time"
)

type Tipo string

const (
	Confirmacion Tipo = "CONFIRMACION"
	Recordatorio Tipo = "RECORDATORIO"
	AlertaMulta  Tipo = "ALERTA_MULTA"
	Vencimiento  Tipo = "VENCIMIENTO"
)

type Estado string

const (
	Pendiente Estado = "PENDIENTE"
	Enviada   Estado = "ENVIADA"
	Fallida   Estado = "FALLIDA"
)

const (
	MaxMensaje   = 500
	MaxError     = 300
	EsperaInicio = 30 * time.Second
)

// Notificacion es un aviso dirigido a un usuario (figura 4.1).
type Notificacion struct {
	IDNotificacion    string     `json:"idNotificacion"`
	IDUsuario         string     `json:"idUsuario"`
	IDPrestamo        *string    `json:"idPrestamo"`
	Tipo              Tipo       `json:"tipo"`
	Mensaje           string     `json:"mensaje"`
	Canal             string     `json:"canal"`
	Estado            Estado     `json:"estado"`
	Leida             bool       `json:"leida"`
	ClaveIdempotencia *string    `json:"-"`
	Intentos          int        `json:"intentos"`
	ProximoReintento  *time.Time `json:"proximoReintento"`
	UltimoError       *string    `json:"-"`
	FechaCreacion     time.Time  `json:"fechaCreacion"`
	FechaEnvio        *time.Time `json:"fechaEnvio"`
}

// TipoValido indica si el tipo pertenece al catálogo de avisos.
func TipoValido(t Tipo) bool {
	switch t {
	case Confirmacion, Recordatorio, AlertaMulta, Vencimiento:
		return true
	}
	return false
}

// Validar revisa los datos de entrada y devuelve la lista de problemas (vacía si es válida).
func Validar(idUsuario string, tipo Tipo, mensaje string) []string {
	var p []string
	if strings.TrimSpace(idUsuario) == "" {
		p = append(p, "idUsuario es obligatorio")
	}
	if !TipoValido(tipo) {
		p = append(p, "tipo debe ser CONFIRMACION, RECORDATORIO, ALERTA_MULTA o VENCIMIENTO")
	}
	m := strings.TrimSpace(mensaje)
	if m == "" {
		p = append(p, "mensaje es obligatorio")
	} else if len([]rune(m)) > MaxMensaje {
		p = append(p, "mensaje admite como máximo 500 caracteres")
	}
	return p
}

// MarcarEnviada registra un envío exitoso.
func (n *Notificacion) MarcarEnviada(ahora time.Time) {
	n.Estado = Enviada
	n.FechaEnvio = &ahora
	n.ProximoReintento = nil
	n.UltimoError = nil
}

// RegistrarFallo aplica la figura 6.5: intentos + 1; si quedan intentos se fija el próximo
// reintento con retroceso exponencial (30 s, 60 s, 120 s…); si se agotan queda para revisión.
func (n *Notificacion) RegistrarFallo(err string, ahora time.Time, maxIntentos int) {
	n.Intentos++
	n.Estado = Fallida
	if r := []rune(err); len(r) > MaxError {
		err = string(r[:MaxError])
	}
	n.UltimoError = &err
	if n.Intentos >= maxIntentos {
		n.ProximoReintento = nil
		return
	}
	espera := EsperaInicio << uint(min(n.Intentos-1, 10))
	t := ahora.Add(espera)
	n.ProximoReintento = &t
}

// DebeReintentarse indica si el trabajador de reintentos debe procesarla ahora.
func (n *Notificacion) DebeReintentarse(ahora time.Time) bool {
	if n.Estado == Pendiente {
		return true
	}
	return n.Estado == Fallida && n.ProximoReintento != nil && !n.ProximoReintento.After(ahora)
}
