package servicio_test

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/itl/biblioteca/notificaciones/internal/almacen/memoria"
	"github.com/itl/biblioteca/notificaciones/internal/dominio"
	"github.com/itl/biblioteca/notificaciones/internal/seguridad"
	"github.com/itl/biblioteca/notificaciones/internal/servicio"
)

// canalFalso permite simular caídas del medio de envío.
type canalFalso struct {
	mu     sync.Mutex
	caido  bool
	envios int
}

func (c *canalFalso) Nombre() string { return "APP" }
func (c *canalFalso) Enviar(context.Context, dominio.Notificacion) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.caido {
		return errors.New("medio de envío no disponible")
	}
	c.envios++
	return nil
}

type reloj struct{ t time.Time }

func (r *reloj) ahora() time.Time { return r.t }

var (
	ctx     = context.Background()
	interno = seguridad.Sesion{Interno: true}
	ana     = seguridad.Sesion{IDUsuario: "U123", Rol: "ALUMNO"}
	beto    = seguridad.Sesion{IDUsuario: "U124", Rol: "ALUMNO"}
	laura   = seguridad.Sesion{IDUsuario: "U900", Rol: "BIBLIOTECARIO"}
	p0101   = "P-0101"
)

func preparar() (*servicio.Servicio, *canalFalso, *reloj) {
	c := &canalFalso{}
	r := &reloj{time.Date(2026, 10, 9, 16, 15, 0, 0, time.UTC)}
	return servicio.Nuevo(memoria.Nuevo(), c, r.ahora, 3), c, r
}

func entrada(usuario string) servicio.Entrada {
	return servicio.Entrada{IDUsuario: usuario, IDPrestamo: &p0101, Tipo: dominio.Confirmacion,
		Mensaje: "Tu solicitud fue registrada. Recógela antes del 12 de octubre."}
}

func codigo(err error) string {
	var e *servicio.Error
	if errors.As(err, &e) {
		return e.Codigo
	}
	return ""
}

func TestCrearGuardaYEnvia(t *testing.T) {
	svc, canal, _ := preparar()
	n, creada, err := svc.Crear(ctx, interno, entrada("U123"), "CONFIRMACION:P-0101")
	if err != nil || !creada {
		t.Fatalf("err %v creada %v", err, creada)
	}
	if n.IDNotificacion != "N-0001" || n.Estado != dominio.Enviada || n.FechaEnvio == nil || canal.envios != 1 {
		t.Fatalf("notificación inesperada: %+v", n)
	}
}

func TestIdempotenciaPorClave(t *testing.T) {
	svc, canal, _ := preparar()
	a, _, _ := svc.Crear(ctx, interno, entrada("U123"), "CONFIRMACION:P-0101")
	b, creada, err := svc.Crear(ctx, interno, entrada("U123"), "CONFIRMACION:P-0101")
	if err != nil || creada || a.IDNotificacion != b.IDNotificacion || canal.envios != 1 {
		t.Fatalf("repetir con la misma clave no debe duplicar (creada=%v, envios=%d)", creada, canal.envios)
	}
	c, creada, _ := svc.Crear(ctx, interno, entrada("U123"), "")
	if !creada || c.IDNotificacion == a.IDNotificacion {
		t.Fatal("sin clave se crea un aviso nuevo")
	}
}

func TestIdempotenciaConPeticionesSimultaneas(t *testing.T) {
	svc, canal, _ := preparar()
	var wg sync.WaitGroup
	ids := make(chan string, 20)
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			n, _, err := svc.Crear(ctx, interno, entrada("U123"), "MULTA:M-0007")
			if err == nil {
				ids <- n.IDNotificacion
			}
		}()
	}
	wg.Wait()
	close(ids)
	distintos := map[string]bool{}
	for id := range ids {
		distintos[id] = true
	}
	if len(distintos) != 1 || canal.envios != 1 {
		t.Fatalf("20 peticiones con la misma clave deben dar 1 aviso; obtuve %d avisos y %d envíos", len(distintos), canal.envios)
	}
}

func TestSoloServiciosInternosCrean(t *testing.T) {
	svc, _, _ := preparar()
	if _, _, err := svc.Crear(ctx, laura, entrada("U123"), ""); codigo(err) != "ACCESO_DENEGADO" {
		t.Fatalf("un usuario no debe crear avisos: %v", err)
	}
}

func TestValidacion(t *testing.T) {
	svc, _, _ := preparar()
	e := entrada("")
	e.Tipo = "OTRO"
	_, _, err := svc.Crear(ctx, interno, e, "")
	if codigo(err) != "DATOS_INVALIDOS" {
		t.Fatalf("esperaba DATOS_INVALIDOS: %v", err)
	}
}

// PI18 (lado de Notificaciones): si el medio falla el aviso no se pierde y se reintenta.
func TestFalloDeEnvioYReintento(t *testing.T) {
	svc, canal, r := preparar()
	canal.caido = true
	n, _, err := svc.Crear(ctx, interno, entrada("U123"), "k1")
	if err != nil || n.Estado != dominio.Fallida || n.Intentos != 1 || n.ProximoReintento == nil {
		t.Fatalf("debe quedar FALLIDA con próximo reintento: %+v", n)
	}
	if k, _ := svc.ProcesarReintentos(ctx); k != 0 {
		t.Fatal("antes de 30 s no se reintenta")
	}
	canal.caido = false
	r.t = r.t.Add(31 * time.Second)
	if k, _ := svc.ProcesarReintentos(ctx); k != 1 {
		t.Fatal("a los 30 s se reintenta")
	}
	final, _ := svc.Obtener(ctx, interno, n.IDNotificacion)
	if final.Estado != dominio.Enviada || final.Intentos != 1 {
		t.Fatalf("debe quedar ENVIADA: %+v", final)
	}
}

func TestIntentosAgotados(t *testing.T) {
	svc, canal, r := preparar()
	canal.caido = true
	n, _, _ := svc.Crear(ctx, interno, entrada("U123"), "k1")
	for i := 0; i < 5; i++ {
		r.t = r.t.Add(10 * time.Minute)
		svc.ProcesarReintentos(ctx)
	}
	final, _ := svc.Obtener(ctx, interno, n.IDNotificacion)
	if final.Intentos != 3 || final.Estado != dominio.Fallida || final.ProximoReintento != nil {
		t.Fatalf("con máximo 3 intentos debe quedar FALLIDA para revisión: %+v", final)
	}
}

func TestPermisosDeConsulta(t *testing.T) {
	svc, _, _ := preparar()
	n, _, _ := svc.Crear(ctx, interno, entrada("U123"), "")
	if _, err := svc.Obtener(ctx, ana, n.IDNotificacion); err != nil {
		t.Fatal("el destinatario puede verla")
	}
	if _, err := svc.Obtener(ctx, beto, n.IDNotificacion); codigo(err) != "ACCESO_DENEGADO" {
		t.Fatal("otro usuario no puede verla")
	}
	if _, err := svc.Obtener(ctx, laura, n.IDNotificacion); err != nil {
		t.Fatal("el personal puede verla")
	}
	if _, err := svc.Obtener(ctx, ana, "N-9999"); codigo(err) != "NOTIFICACION_NO_ENCONTRADA" {
		t.Fatal("inexistente → 404")
	}
}

func TestListarSoloLoPropioYMasRecientePrimero(t *testing.T) {
	svc, _, r := preparar()
	svc.Crear(ctx, interno, entrada("U123"), "")
	r.t = r.t.Add(time.Hour)
	ultima, _, _ := svc.Crear(ctx, interno, entrada("U123"), "")
	svc.Crear(ctx, interno, entrada("U124"), "")

	p, err := svc.Listar(ctx, ana, servicio.Filtro{})
	if err != nil || p.Total != 2 || p.Items[0].IDNotificacion != ultima.IDNotificacion {
		t.Fatalf("Ana debe ver sus 2 avisos, el más reciente primero: %+v", p)
	}
	if _, err := svc.Listar(ctx, ana, servicio.Filtro{IDUsuario: "U124"}); codigo(err) != "ACCESO_DENEGADO" {
		t.Fatal("no puede listar los de otro usuario")
	}
	todos, _ := svc.Listar(ctx, laura, servicio.Filtro{})
	if todos.Total != 3 {
		t.Fatalf("el personal ve todo: %d", todos.Total)
	}
	vacia, _ := svc.Listar(ctx, seguridad.Sesion{IDUsuario: "U555", Rol: "ALUMNO"}, servicio.Filtro{})
	if vacia.Items == nil || vacia.Total != 0 {
		t.Fatal("sin avisos debe devolver lista vacía, no null")
	}
}

func TestPaginacion(t *testing.T) {
	svc, _, _ := preparar()
	for i := 0; i < 5; i++ {
		svc.Crear(ctx, interno, entrada("U123"), "")
	}
	p, _ := svc.Listar(ctx, ana, servicio.Filtro{Pagina: 3, Tamano: 2})
	if len(p.Items) != 1 || p.Total != 5 || p.Pagina != 3 {
		t.Fatalf("página 3 de tamaño 2 debe tener 1 elemento: %+v", p)
	}
}

func TestMarcarLeida(t *testing.T) {
	svc, _, _ := preparar()
	n, _, _ := svc.Crear(ctx, interno, entrada("U123"), "")
	if _, err := svc.MarcarLeida(ctx, beto, n.IDNotificacion); codigo(err) != "ACCESO_DENEGADO" {
		t.Fatal("solo el destinatario la marca")
	}
	l, err := svc.MarcarLeida(ctx, ana, n.IDNotificacion)
	if err != nil || !l.Leida {
		t.Fatal("debe quedar leída")
	}
	p, _ := svc.Listar(ctx, ana, servicio.Filtro{SoloNoLeidas: true})
	if p.Total != 0 {
		t.Fatal("el filtro de no leídas debe excluirla")
	}
}
