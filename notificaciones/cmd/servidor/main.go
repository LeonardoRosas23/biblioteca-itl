// MS Notificaciones · Go + Fiber.
package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"strconv"
	"time"

	"github.com/itl/biblioteca/notificaciones/internal/almacen/postgres"
	"github.com/itl/biblioteca/notificaciones/internal/api"
	"github.com/itl/biblioteca/notificaciones/internal/servicio"
)

func env(clave, defecto string) string {
	if v := os.Getenv(clave); v != "" {
		return v
	}
	return defecto
}

func main() {
	ctx, cancelar := signal.NotifyContext(context.Background(), os.Interrupt)
	defer cancelar()

	almacen, err := postgres.Conectar(ctx,
		env("DB_URL", "postgres://postgres:postgres@localhost:5432/bd_notificaciones"),
		env("SCHEMA_SQL", "db/schema.sql"))
	if err != nil {
		log.Fatalf("no se pudo conectar a PostgreSQL: %v", err)
	}
	defer almacen.Cerrar()

	maxIntentos, _ := strconv.Atoi(env("MAX_REINTENTOS", "5"))
	svc := servicio.Nuevo(almacen, servicio.CanalApp{}, time.Now, maxIntentos)

	// Trabajador de reintentos (figura 6.5)
	go func() {
		t := time.NewTicker(30 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				if n, err := svc.ProcesarReintentos(ctx); err != nil {
					log.Printf("reintentos: %v", err)
				} else if n > 0 {
					log.Printf("reintentos: %d avisos procesados", n)
				}
			}
		}
	}()

	app := api.NuevaApp(svc, api.Config{
		JWTSecret:    env("JWT_SECRET", "solo-para-desarrollo-cambiar-por-secreto-largo"),
		ServiceToken: env("SERVICE_TOKEN", "token-interno-dev"),
	})
	go func() {
		<-ctx.Done()
		_ = app.Shutdown()
	}()
	puerto := env("PORT", "8090")
	log.Printf("MS Notificaciones escuchando en el puerto %s", puerto)
	if err := app.Listen(":" + puerto); err != nil {
		log.Fatal(err)
	}
}
