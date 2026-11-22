// Package servicio contiene los casos de uso de Notificaciones. Depende solo de interfaces
// (Almacen y Canal), así que se prueba sin base de datos ni red.
package servicio

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/itl/biblioteca/notificaciones/internal/dominio"
	"github.com/itl/biblioteca/notificaciones/internal/seguridad"
)

// Error de negocio con el formato común { codigo, mensaje }.
type Error struct {
	Status  int
	Codigo  string
	Mensaje string
}

func (e *Error) Error() string { return e.Mensaje }

func errInvalido(m string) *Error  { return &Error{400, "DATOS_INVALIDOS", m} }
func errProhibido(m string) *Error { return &Error{403, "ACCESO_DENEGADO", m} }
func errNoEncontrada() *Error {
	return &Error{404, "NOTIFICACION_NO_ENCONTRADA", "La notificación no existe."}
}

// ErrClaveDuplicada lo devuelve el almacén cuando la clave de idempotencia ya existe.
var ErrClaveDuplicada = errors.New("clave de idempotencia duplicada")

type Filtro struct {
	IDUsuario    string
	SoloNoLeidas bool
	Pagina       int
	Tamano       int
}

// Almacen es el puerto de persistencia (PostgreSQL en producción, memoria en pruebas).
type Almacen interface {
	SiguienteID(ctx context.Context) (string, error)
	Insertar(ctx context.Context, n *dominio.Notificacion) error
	BuscarPorID(ctx context.Context, id string) (*dominio.Notificacion, error)
	BuscarPorClave(ctx context.Context, clave string) (*dominio.Notificacion, error)
	Listar(ctx context.Context, f Filtro) ([]dominio.Notificacion, int, error)
	Actualizar(ctx context.Context, n *dominio.Notificacion) error
	ParaReintentar(ctx context.Context, ahora time.Time, limite int) ([]dominio.Notificacion, error)
}

// Canal entrega el aviso (dentro de la app, correo, push…). El método es una decisión pendiente (sección 8).
type Canal interface {
	Nombre() string
	Enviar(ctx context.Context, n dominio.Notificacion) error
}

// CanalApp: el aviso queda disponible en la bandeja "Avisos" de la app; entregarlo es guardarlo.
type CanalApp struct{}

func (CanalApp) Nombre() string                                     { return "APP" }
func (CanalApp) Enviar(context.Context, dominio.Notificacion) error { return nil }

type Entrada struct {
	IDUsuario  string       `json:"idUsuario"`
	IDPrestamo *string      `json:"idPrestamo"`
	Tipo       dominio.Tipo `json:"tipo"`
	Mensaje    string       `json:"mensaje"`
}

type Servicio struct {
	almacen     Almacen
	canal       Canal
	ahora       func() time.Time
	maxIntentos int
}

func Nuevo(a Almacen, c Canal, reloj func() time.Time, maxIntentos int) *Servicio {
	if reloj == nil {
		reloj = time.Now
	}
	if maxIntentos <= 0 {
		maxIntentos = 5
	}
	return &Servicio{almacen: a, canal: c, ahora: reloj, maxIntentos: maxIntentos}
}

// Crear guarda el aviso y lo intenta enviar. Devuelve creada=false si la clave ya existía (D7).
func (s *Servicio) Crear(ctx context.Context, ses seguridad.Sesion, e Entrada, clave string) (*dominio.Notificacion, bool, error) {
	if !ses.Interno {
		return nil, false, errProhibido("Solo los servicios internos crean notificaciones.")
	}
	if p := dominio.Validar(e.IDUsuario, e.Tipo, e.Mensaje); len(p) > 0 {
		return nil, false, errInvalido("Revisa los campos: " + strings.Join(p, "; ") + ".")
	}
	clave = strings.TrimSpace(clave)
	if len(clave) > 120 {
		return nil, false, errInvalido("Idempotency-Key admite como máximo 120 caracteres.")
	}
	if clave != "" {
		if previa, err := s.almacen.BuscarPorClave(ctx, clave); err != nil {
			return nil, false, err
		} else if previa != nil {
			return previa, false, nil
		}
	}
	id, err := s.almacen.SiguienteID(ctx)
	if err != nil {
		return nil, false, err
	}
	n := &dominio.Notificacion{
		IDNotificacion: id, IDUsuario: strings.TrimSpace(e.IDUsuario), IDPrestamo: e.IDPrestamo,
		Tipo: e.Tipo, Mensaje: strings.TrimSpace(e.Mensaje), Canal: s.canal.Nombre(),
		Estado: dominio.Pendiente, FechaCreacion: s.ahora().UTC(),
	}
	if clave != "" {
		n.ClaveIdempotencia = &clave
	}
	// 1) Se guarda primero: si el envío falla, el aviso no se pierde (sección 6.5)
	if err := s.almacen.Insertar(ctx, n); err != nil {
		if errors.Is(err, ErrClaveDuplicada) { // dos peticiones simultáneas con la misma clave
			previa, err2 := s.almacen.BuscarPorClave(ctx, clave)
			return previa, false, err2
		}
		return nil, false, err
	}
	// 2) Se intenta enviar de inmediato
	s.intentarEnvio(ctx, n)
	return n, true, nil
}

func (s *Servicio) intentarEnvio(ctx context.Context, n *dominio.Notificacion) {
	if err := s.canal.Enviar(ctx, *n); err != nil {
		n.RegistrarFallo(err.Error(), s.ahora().UTC(), s.maxIntentos)
	} else {
		n.MarcarEnviada(s.ahora().UTC())
	}
	_ = s.almacen.Actualizar(ctx, n)
}

// ProcesarReintentos lo llama el trabajador periódico. Devuelve cuántas se intentaron.
func (s *Servicio) ProcesarReintentos(ctx context.Context) (int, error) {
	lista, err := s.almacen.ParaReintentar(ctx, s.ahora().UTC(), 100)
	if err != nil {
		return 0, err
	}
	for i := range lista {
		s.intentarEnvio(ctx, &lista[i])
	}
	return len(lista), nil
}

// Obtener: servicio interno, personal o el propio destinatario.
func (s *Servicio) Obtener(ctx context.Context, ses seguridad.Sesion, id string) (*dominio.Notificacion, error) {
	n, err := s.almacen.BuscarPorID(ctx, id)
	if err != nil {
		return nil, err
	}
	if n == nil {
		return nil, errNoEncontrada()
	}
	if !ses.EsStaff() && n.IDUsuario != ses.IDUsuario {
		return nil, errProhibido("Solo puedes consultar tus propios avisos.")
	}
	return n, nil
}

type Pagina struct {
	Items  []dominio.Notificacion `json:"items"`
	Pagina int                    `json:"pagina"`
	Tamano int                    `json:"tamano"`
	Total  int                    `json:"total"`
}

// Listar: un usuario ve solo sus avisos (RN09); el personal puede filtrar por usuario.
func (s *Servicio) Listar(ctx context.Context, ses seguridad.Sesion, f Filtro) (*Pagina, error) {
	if !ses.EsStaff() {
		if f.IDUsuario != "" && f.IDUsuario != ses.IDUsuario {
			return nil, errProhibido("Solo puedes consultar tus propios avisos.")
		}
		f.IDUsuario = ses.IDUsuario
	}
	if f.Pagina < 1 {
		f.Pagina = 1
	}
	if f.Tamano < 1 || f.Tamano > 100 {
		f.Tamano = 20
	}
	items, total, err := s.almacen.Listar(ctx, f)
	if err != nil {
		return nil, err
	}
	if items == nil {
		items = []dominio.Notificacion{}
	}
	return &Pagina{Items: items, Pagina: f.Pagina, Tamano: f.Tamano, Total: total}, nil
}

// MarcarLeida: solo el destinatario marca sus avisos como leídos.
func (s *Servicio) MarcarLeida(ctx context.Context, ses seguridad.Sesion, id string) (*dominio.Notificacion, error) {
	n, err := s.almacen.BuscarPorID(ctx, id)
	if err != nil {
		return nil, err
	}
	if n == nil {
		return nil, errNoEncontrada()
	}
	if n.IDUsuario != ses.IDUsuario {
		return nil, errProhibido("Solo puedes marcar tus propios avisos.")
	}
	if !n.Leida {
		n.Leida = true
		if err := s.almacen.Actualizar(ctx, n); err != nil {
			return nil, err
		}
	}
	return n, nil
}
