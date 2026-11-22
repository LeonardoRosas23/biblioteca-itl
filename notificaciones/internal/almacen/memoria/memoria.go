// Package memoria implementa servicio.Almacen en memoria (pruebas y desarrollo sin base de datos).
package memoria

import (
	"context"
	"fmt"
	"sort"
	"sync"
	"time"

	"github.com/itl/biblioteca/notificaciones/internal/dominio"
	"github.com/itl/biblioteca/notificaciones/internal/servicio"
)

type Almacen struct {
	mu    sync.Mutex
	seq   int
	datos map[string]dominio.Notificacion
}

func Nuevo() *Almacen { return &Almacen{datos: map[string]dominio.Notificacion{}} }

func (a *Almacen) SiguienteID(context.Context) (string, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.seq++
	return fmt.Sprintf("N-%04d", a.seq), nil
}

func (a *Almacen) Insertar(_ context.Context, n *dominio.Notificacion) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if n.ClaveIdempotencia != nil {
		for _, x := range a.datos {
			if x.ClaveIdempotencia != nil && *x.ClaveIdempotencia == *n.ClaveIdempotencia {
				return servicio.ErrClaveDuplicada
			}
		}
	}
	a.datos[n.IDNotificacion] = *n
	return nil
}

func (a *Almacen) BuscarPorID(_ context.Context, id string) (*dominio.Notificacion, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if n, ok := a.datos[id]; ok {
		return &n, nil
	}
	return nil, nil
}

func (a *Almacen) BuscarPorClave(_ context.Context, clave string) (*dominio.Notificacion, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	for _, n := range a.datos {
		if n.ClaveIdempotencia != nil && *n.ClaveIdempotencia == clave {
			c := n
			return &c, nil
		}
	}
	return nil, nil
}

func (a *Almacen) Listar(_ context.Context, f servicio.Filtro) ([]dominio.Notificacion, int, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	var l []dominio.Notificacion
	for _, n := range a.datos {
		if (f.IDUsuario == "" || n.IDUsuario == f.IDUsuario) && (!f.SoloNoLeidas || !n.Leida) {
			l = append(l, n)
		}
	}
	sort.Slice(l, func(i, j int) bool {
		if l[i].FechaCreacion.Equal(l[j].FechaCreacion) {
			return l[i].IDNotificacion > l[j].IDNotificacion
		}
		return l[i].FechaCreacion.After(l[j].FechaCreacion)
	})
	total := len(l)
	ini := (f.Pagina - 1) * f.Tamano
	if ini > total {
		ini = total
	}
	fin := min(ini+f.Tamano, total)
	return l[ini:fin], total, nil
}

func (a *Almacen) Actualizar(_ context.Context, n *dominio.Notificacion) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.datos[n.IDNotificacion] = *n
	return nil
}

func (a *Almacen) ParaReintentar(_ context.Context, ahora time.Time, limite int) ([]dominio.Notificacion, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	var l []dominio.Notificacion
	for _, n := range a.datos {
		if n.DebeReintentarse(ahora) {
			l = append(l, n)
		}
	}
	sort.Slice(l, func(i, j int) bool { return l[i].IDNotificacion < l[j].IDNotificacion })
	if len(l) > limite {
		l = l[:limite]
	}
	return l, nil
}
