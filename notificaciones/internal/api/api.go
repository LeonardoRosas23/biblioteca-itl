// Package api expone el servicio por HTTP con Fiber (capa de presentación).
package api

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/itl/biblioteca/notificaciones/internal/seguridad"
	"github.com/itl/biblioteca/notificaciones/internal/servicio"
)

type Config struct {
	JWTSecret    string
	ServiceToken string
	Reloj        func() time.Time
}

func cid(c *fiber.Ctx) string {
	if v, ok := c.Locals("cid").(string); ok {
		return v
	}
	return ""
}

func responderError(c *fiber.Ctx, status int, codigo, mensaje string) error {
	return c.Status(status).JSON(fiber.Map{"codigo": codigo, "mensaje": mensaje, "correlacionId": cid(c)})
}

// manejadorErrores traduce cualquier error al formato común de la sección 5.4.
func manejadorErrores(c *fiber.Ctx, err error) error {
	var se *servicio.Error
	if errors.As(err, &se) {
		return responderError(c, se.Status, se.Codigo, se.Mensaje)
	}
	var fe *fiber.Error
	if errors.As(err, &fe) {
		if fe.Code == fiber.StatusNotFound {
			return responderError(c, 404, "RUTA_NO_ENCONTRADA", "La ruta solicitada no existe.")
		}
		return responderError(c, fe.Code, "ERROR_HTTP", fe.Message)
	}
	log.Printf("[%s] error no controlado: %v", cid(c), err)
	return responderError(c, 500, "ERROR_INTERNO", "Ocurrió un error inesperado.")
}

func NuevaApp(svc *servicio.Servicio, cfg Config) *fiber.App {
	if cfg.Reloj == nil {
		cfg.Reloj = time.Now
	}
	app := fiber.New(fiber.Config{AppName: "MS Notificaciones", ErrorHandler: manejadorErrores})

	// D8: X-Correlation-Id
	app.Use(func(c *fiber.Ctx) error {
		id := c.Get("X-Correlation-Id")
		if id == "" {
			b := make([]byte, 4)
			_, _ = rand.Read(b)
			id = hex.EncodeToString(b)
		}
		c.Locals("cid", id)
		c.Set("X-Correlation-Id", id)
		return c.Next()
	})

	// Identidad: X-Service-Token (red interna) o JWT de Usuarios
	autenticar := func(c *fiber.Ctx) error {
		var s seguridad.Sesion
		if t := c.Get("X-Service-Token"); t != "" && t == cfg.ServiceToken {
			s.Interno = true
		}
		if h := c.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
			ses, err := seguridad.VerificarJWT(strings.TrimPrefix(h, "Bearer "), cfg.JWTSecret, cfg.Reloj())
			if err != nil {
				return responderError(c, 401, "NO_AUTENTICADO", "El token es inválido o expiró.")
			}
			s.IDUsuario, s.Rol = ses.IDUsuario, ses.Rol
		}
		if !s.Autenticada() {
			return responderError(c, 401, "NO_AUTENTICADO", "Se requiere un token válido.")
		}
		c.Locals("sesion", s)
		return c.Next()
	}
	sesion := func(c *fiber.Ctx) seguridad.Sesion { return c.Locals("sesion").(seguridad.Sesion) }

	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"servicio": "notificaciones", "estado": "OK"})
	})

	g := app.Group("/api/v1/notificaciones", autenticar)

	// Interno: Préstamos registra un aviso (D6, D7)
	g.Post("/", func(c *fiber.Ctx) error {
		var e servicio.Entrada
		if err := c.BodyParser(&e); err != nil {
			return responderError(c, 400, "DATOS_INVALIDOS", "El cuerpo no es JSON válido.")
		}
		n, creada, err := svc.Crear(c.UserContext(), sesion(c), e, c.Get("Idempotency-Key"))
		if err != nil {
			return err
		}
		if !creada {
			return c.Status(fiber.StatusOK).JSON(n)
		}
		return c.Status(fiber.StatusCreated).JSON(n)
	})

	// Bandeja del usuario autenticado (pantalla "Avisos")
	g.Get("/", func(c *fiber.Ctx) error {
		p, err := svc.Listar(c.UserContext(), sesion(c), servicio.Filtro{
			IDUsuario:    c.Query("idUsuario"),
			SoloNoLeidas: c.QueryBool("noLeidas", false),
			Pagina:       c.QueryInt("pagina", 1),
			Tamano:       c.QueryInt("tamano", 20),
		})
		if err != nil {
			return err
		}
		return c.JSON(p)
	})

	g.Get("/:id", func(c *fiber.Ctx) error {
		n, err := svc.Obtener(c.UserContext(), sesion(c), c.Params("id"))
		if err != nil {
			return err
		}
		return c.JSON(n)
	})

	g.Patch("/:id/leida", func(c *fiber.Ctx) error {
		n, err := svc.MarcarLeida(c.UserContext(), sesion(c), c.Params("id"))
		if err != nil {
			return err
		}
		return c.JSON(n)
	})

	return app
}
