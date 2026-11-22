// Package postgres implementa servicio.Almacen sobre PostgreSQL con pgx.
package postgres

import (
	"context"
	"errors"
	"fmt"
	"os"
	"time"

	"github.com/itl/biblioteca/notificaciones/internal/dominio"
	"github.com/itl/biblioteca/notificaciones/internal/servicio"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Almacen struct{ pool *pgxpool.Pool }

func Conectar(ctx context.Context, url, rutaSchema string) (*Almacen, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		return nil, err
	}
	ddl, err := os.ReadFile(rutaSchema)
	if err != nil {
		return nil, err
	}
	if _, err := pool.Exec(ctx, string(ddl)); err != nil {
		return nil, fmt.Errorf("aplicando schema.sql: %w", err)
	}
	return &Almacen{pool: pool}, nil
}

func (a *Almacen) Cerrar() { a.pool.Close() }

const columnas = `id_notificacion, id_usuario, id_prestamo, tipo, mensaje, canal, estado, leida,
	clave_idempotencia, intentos, proximo_reintento, ultimo_error, fecha_creacion, fecha_envio`

func escanear(r pgx.Row) (*dominio.Notificacion, error) {
	var n dominio.Notificacion
	var tipo, estado string
	err := r.Scan(&n.IDNotificacion, &n.IDUsuario, &n.IDPrestamo, &tipo, &n.Mensaje, &n.Canal, &estado, &n.Leida,
		&n.ClaveIdempotencia, &n.Intentos, &n.ProximoReintento, &n.UltimoError, &n.FechaCreacion, &n.FechaEnvio)
	if err != nil {
		return nil, err
	}
	n.Tipo, n.Estado = dominio.Tipo(tipo), dominio.Estado(estado)
	return &n, nil
}

func (a *Almacen) SiguienteID(ctx context.Context) (string, error) {
	var n int64
	if err := a.pool.QueryRow(ctx, "SELECT nextval('notificacion_seq')").Scan(&n); err != nil {
		return "", err
	}
	return fmt.Sprintf("N-%04d", n), nil
}

func (a *Almacen) Insertar(ctx context.Context, n *dominio.Notificacion) error {
	_, err := a.pool.Exec(ctx, `INSERT INTO notificacion (`+columnas+`)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
		n.IDNotificacion, n.IDUsuario, n.IDPrestamo, string(n.Tipo), n.Mensaje, n.Canal, string(n.Estado), n.Leida,
		n.ClaveIdempotencia, n.Intentos, n.ProximoReintento, n.UltimoError, n.FechaCreacion, n.FechaEnvio)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return servicio.ErrClaveDuplicada
	}
	return err
}

func (a *Almacen) uno(ctx context.Context, where string, arg any) (*dominio.Notificacion, error) {
	n, err := escanear(a.pool.QueryRow(ctx, "SELECT "+columnas+" FROM notificacion WHERE "+where, arg))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return n, err
}

func (a *Almacen) BuscarPorID(ctx context.Context, id string) (*dominio.Notificacion, error) {
	return a.uno(ctx, "id_notificacion = $1", id)
}

func (a *Almacen) BuscarPorClave(ctx context.Context, clave string) (*dominio.Notificacion, error) {
	return a.uno(ctx, "clave_idempotencia = $1", clave)
}

func (a *Almacen) Listar(ctx context.Context, f servicio.Filtro) ([]dominio.Notificacion, int, error) {
	where := "($1 = '' OR id_usuario = $1) AND (NOT $2 OR leida = FALSE)"
	var total int
	if err := a.pool.QueryRow(ctx, "SELECT count(*) FROM notificacion WHERE "+where, f.IDUsuario, f.SoloNoLeidas).Scan(&total); err != nil {
		return nil, 0, err
	}
	filas, err := a.pool.Query(ctx, "SELECT "+columnas+" FROM notificacion WHERE "+where+
		" ORDER BY fecha_creacion DESC, id_notificacion DESC LIMIT $3 OFFSET $4",
		f.IDUsuario, f.SoloNoLeidas, f.Tamano, (f.Pagina-1)*f.Tamano)
	if err != nil {
		return nil, 0, err
	}
	defer filas.Close()
	lista := []dominio.Notificacion{}
	for filas.Next() {
		n, err := escanear(filas)
		if err != nil {
			return nil, 0, err
		}
		lista = append(lista, *n)
	}
	return lista, total, filas.Err()
}

func (a *Almacen) Actualizar(ctx context.Context, n *dominio.Notificacion) error {
	_, err := a.pool.Exec(ctx, `UPDATE notificacion SET estado=$2, leida=$3, intentos=$4, proximo_reintento=$5,
		ultimo_error=$6, fecha_envio=$7 WHERE id_notificacion=$1`,
		n.IDNotificacion, string(n.Estado), n.Leida, n.Intentos, n.ProximoReintento, n.UltimoError, n.FechaEnvio)
	return err
}

func (a *Almacen) ParaReintentar(ctx context.Context, ahora time.Time, limite int) ([]dominio.Notificacion, error) {
	filas, err := a.pool.Query(ctx, "SELECT "+columnas+` FROM notificacion
		WHERE estado = 'PENDIENTE' OR (estado = 'FALLIDA' AND proximo_reintento <= $1)
		ORDER BY id_notificacion LIMIT $2`, ahora, limite)
	if err != nil {
		return nil, err
	}
	defer filas.Close()
	var lista []dominio.Notificacion
	for filas.Next() {
		n, err := escanear(filas)
		if err != nil {
			return nil, err
		}
		lista = append(lista, *n)
	}
	return lista, filas.Err()
}
