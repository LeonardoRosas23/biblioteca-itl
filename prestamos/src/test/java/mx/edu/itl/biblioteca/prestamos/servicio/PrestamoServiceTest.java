package mx.edu.itl.biblioteca.prestamos.servicio;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import java.time.Duration;
import java.time.LocalDate;
import mx.edu.itl.biblioteca.prestamos.BasePrueba;
import mx.edu.itl.biblioteca.prestamos.comun.ApiException;
import mx.edu.itl.biblioteca.prestamos.dominio.*;
import mx.edu.itl.biblioteca.prestamos.integracion.Clientes.*;
import mx.edu.itl.biblioteca.prestamos.repositorio.EventoRepository;
import mx.edu.itl.biblioteca.prestamos.repositorio.MultaRepository;
import mx.edu.itl.biblioteca.prestamos.repositorio.PrestamoRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

@DisplayName("PrestamoService · reglas de negocio con H2 y servicios simulados")
class PrestamoServiceTest extends BasePrueba {

    @Autowired PrestamoService svc;
    @Autowired MultaService multaSvc;
    @Autowired EventoService eventoSvc;
    @Autowired PrestamoRepository prestamos;
    @Autowired MultaRepository multas;
    @Autowired EventoRepository eventos;

    private ApiException error(Runnable r) {
        try {
            r.run();
        } catch (ApiException e) {
            return e;
        }
        throw new AssertionError("Se esperaba ApiException");
    }

    private Prestamo activo(String recurso) {
        Prestamo p = svc.solicitar(alumno, recurso);
        return svc.aprobarEntrega(biblio, p.getIdPrestamo());
    }

    @Nested
    @DisplayName("CU01 · Solicitar préstamo")
    class Solicitar {

        @Test
        @DisplayName("PI07: crea PENDIENTE_ENTREGA, reserva en Catálogo y avisa")
        void solicitudValida() {
            Prestamo p = svc.solicitar(alumno, "R001");
            assertThat(p.getIdPrestamo()).matches("P-\\d{4}");
            assertThat(p.getEstado()).isEqualTo(EstadoPrestamo.PENDIENTE_ENTREGA);
            assertThat(p.getTituloRecurso()).isEqualTo("Cálculo diferencial");
            assertThat(p.getReservaVigenteHasta()).isEqualTo(T0.plus(Duration.ofHours(72)));
            assertThat(p.getFechaDevolucionEstimada()).isEqualTo(LocalDate.of(2026, 10, 16));
            verify(catalogo).reservar("R001", p.getIdPrestamo());
            verify(notificaciones).crear(argThat(m -> "CONFIRMACION".equals(m.get("tipo"))
                    && "U123".equals(m.get("idUsuario"))), eq("CONFIRMACION:" + p.getIdPrestamo()));
        }

        @Test
        @DisplayName("PI08: sin existencias → 409 y no se crea préstamo")
        void sinExistencias() {
            when(catalogo.obtener("R001")).thenReturn(new RecursoInfo("R001", "t", "LIBRO", 0, "PRESTADO"));
            assertThat(error(() -> svc.solicitar(alumno, "R001")).getCodigo()).isEqualTo("RECURSO_NO_DISPONIBLE");
            assertThat(prestamos.count()).isZero();
            verify(catalogo, never()).reservar(anyString(), anyString());
        }

        @Test
        @DisplayName("PI09: si otro ganó la última existencia, la reserva da 409")
        void carreraPorLaUltimaExistencia() {
            doThrow(new RemotoException(409, "SIN_EXISTENCIAS", "sin existencias"))
                    .when(catalogo).reservar(eq("R001"), anyString());
            ApiException e = error(() -> svc.solicitar(alumno, "R001"));
            assertThat(e.getStatus()).isEqualTo(409);
            assertThat(prestamos.count()).isZero();
        }

        @Test
        @DisplayName("PI10: multa pendiente → 403 sin reservar")
        void conMultaPendiente() {
            Prestamo p = activo("R001");
            reloj.avanzar(Duration.ofDays(10));
            svc.registrarDevolucion(biblio, p.getIdPrestamo(), false);
            clearInvocations(catalogo);
            ApiException e = error(() -> svc.solicitar(alumno, "R002"));
            assertThat(e.getStatus()).isEqualTo(403);
            assertThat(e.getCodigo()).isEqualTo("MULTA_PENDIENTE");
            verify(catalogo, never()).reservar(anyString(), anyString());
        }

        @Test
        @DisplayName("PI10: cuenta bloqueada → 403")
        void cuentaBloqueada() {
            when(usuarios.estadoCuenta("U123")).thenReturn(new EstadoCuenta("U123", "Ana", "ALUMNO", "BLOQUEADO"));
            assertThat(error(() -> svc.solicitar(alumno, "R001")).getCodigo()).isEqualTo("CUENTA_BLOQUEADA");
        }

        @Test
        @DisplayName("Un préstamo vencido sin devolver también bloquea nuevas solicitudes")
        void conPrestamoVencido() {
            activo("R001");
            reloj.avanzar(Duration.ofDays(9));
            svc.detectarVencimientos();
            assertThat(error(() -> svc.solicitar(alumno, "R002")).getCodigo()).isEqualTo("PRESTAMO_VENCIDO");
        }

        @Test
        @DisplayName("CU01-A6: límite de préstamos → 409")
        void limiteDePrestamos() {
            svc.solicitar(alumno, "R001");
            svc.solicitar(alumno, "R002");
            svc.solicitar(alumno, "R003");
            assertThat(error(() -> svc.solicitar(alumno, "R004")).getCodigo()).isEqualTo("LIMITE_PRESTAMOS");
        }

        @Test
        void noSePuedePedirDosVecesElMismoRecurso() {
            svc.solicitar(alumno, "R001");
            assertThat(error(() -> svc.solicitar(alumno, "R001")).getCodigo()).isEqualTo("PRESTAMO_DUPLICADO");
        }

        @Test
        void elBibliotecarioNoSolicitaPrestamos() {
            assertThat(error(() -> svc.solicitar(biblio, "R001")).getStatus()).isEqualTo(403);
        }

        @Test
        @DisplayName("PI19: Usuarios caído → 503 y no se reserva nada")
        void usuariosCaido() {
            when(usuarios.estadoCuenta(anyString())).thenThrow(new ServicioNoDisponibleException("Usuarios", null));
            ApiException e = error(() -> svc.solicitar(alumno, "R001"));
            assertThat(e.getStatus()).isEqualTo(503);
            verify(catalogo, never()).reservar(anyString(), anyString());
            assertThat(prestamos.count()).isZero();
        }

        @Test
        @DisplayName("PI19: Catálogo caído → 503 sin reserva huérfana")
        void catalogoCaido() {
            when(catalogo.obtener(anyString())).thenThrow(new ServicioNoDisponibleException("Catálogo", null));
            assertThat(error(() -> svc.solicitar(alumno, "R001")).getStatus()).isEqualTo(503);
            assertThat(prestamos.count()).isZero();
        }

        @Test
        @DisplayName("PI18: Notificaciones caído → el préstamo se conserva y el aviso queda pendiente")
        void notificacionesCaido() {
            doThrow(new ServicioNoDisponibleException("Notificaciones", null)).when(notificaciones).crear(any(), anyString());
            Prestamo p = svc.solicitar(alumno, "R001");
            assertThat(prestamos.findById(p.getIdPrestamo())).isPresent();
            EventoPendiente ev = eventos.findAll().get(0);
            assertThat(ev.getEstado()).isEqualTo(EventoPendiente.Estado.PENDIENTE);
            assertThat(ev.getIntentos()).isEqualTo(1);

            // Vuelve el servicio: el reintento lo entrega
            reset(notificaciones);
            reloj.avanzar(Duration.ofMinutes(1));
            eventoSvc.procesarPendientes();
            assertThat(eventos.findAll().get(0).getEstado()).isEqualTo(EventoPendiente.Estado.ENVIADO);
            verify(notificaciones).crear(any(), eq("CONFIRMACION:" + p.getIdPrestamo()));
        }

        @Test
        @DisplayName("Sin existencias registra la demanda (usada en RN06)")
        void registraDemanda() {
            when(catalogo.obtener("R001")).thenReturn(new RecursoInfo("R001", "t", "LIBRO", 0, "PRESTADO"));
            error(() -> svc.solicitar(otroAlumno, "R001"));
            error(() -> svc.solicitar(otroAlumno, "R001"));
            assertThat(jdbc.queryForObject("SELECT count(*) FROM solicitud_espera", Integer.class)).isEqualTo(1);
        }
    }

    @Nested
    @DisplayName("CU04 · Aprobar entrega")
    class Aprobar {

        @Test
        @DisplayName("PI12: ACTIVO con fecha límite según categoría y aviso a Catálogo")
        void aprobacionValida() {
            when(catalogo.obtener("R045")).thenReturn(new RecursoInfo("R045", "Laptop", "EQUIPO", 1, "DISPONIBLE"));
            Prestamo p = svc.solicitar(alumno, "R045");
            reloj.avanzar(Duration.ofDays(1));
            Prestamo a = svc.aprobarEntrega(biblio, p.getIdPrestamo());
            assertThat(a.getEstado()).isEqualTo(EstadoPrestamo.ACTIVO);
            assertThat(a.getFechaDevolucionEstimada()).isEqualTo(LocalDate.of(2026, 10, 13)); // 10 oct + 3 días (equipo)
            verify(catalogo).entregar("R045", p.getIdPrestamo());
        }

        @Test
        @DisplayName("PI12/CU04-A1: reserva expirada → 409, préstamo RECHAZADO y recurso liberado")
        void reservaExpirada() {
            Prestamo p = svc.solicitar(alumno, "R001");
            reloj.avanzar(Duration.ofHours(73));
            assertThat(error(() -> svc.aprobarEntrega(biblio, p.getIdPrestamo())).getCodigo()).isEqualTo("RESERVA_EXPIRADA");
            Prestamo r = prestamos.findById(p.getIdPrestamo()).orElseThrow();
            assertThat(r.getEstado()).isEqualTo(EstadoPrestamo.RECHAZADO);
            assertThat(r.getMotivo()).isEqualTo("RESERVA_EXPIRADA");
            verify(catalogo).liberar("R001", p.getIdPrestamo());
        }

        @Test
        @DisplayName("CU04-A3: si Catálogo no responde el préstamo queda ACTIVO y el cambio se reintenta")
        void catalogoCaidoAlEntregar() {
            Prestamo p = svc.solicitar(alumno, "R001");
            doThrow(new ServicioNoDisponibleException("Catálogo", null)).when(catalogo).entregar(anyString(), anyString());
            Prestamo a = svc.aprobarEntrega(biblio, p.getIdPrestamo());
            assertThat(a.getEstado()).isEqualTo(EstadoPrestamo.ACTIVO);
            assertThat(eventos.findAll()).anyMatch(e -> e.getTipo() == EventoPendiente.Tipo.CATALOGO_ENTREGA
                    && e.getEstado() == EventoPendiente.Estado.PENDIENTE);
        }

        @Test
        void unAlumnoNoPuedeAprobar() {
            Prestamo p = svc.solicitar(alumno, "R001");
            assertThat(error(() -> svc.aprobarEntrega(alumno, p.getIdPrestamo())).getStatus()).isEqualTo(403);
        }

        @Test
        void prestamoInexistente404() {
            assertThat(error(() -> svc.aprobarEntrega(biblio, "P-9999")).getStatus()).isEqualTo(404);
        }
    }

    @Nested
    @DisplayName("CU05 · Registrar devolución")
    class Devolver {

        @Test
        @DisplayName("PI13: a tiempo → FINALIZADO sin multa y recurso devuelto")
        void aTiempo() {
            Prestamo p = activo("R001");
            reloj.avanzar(Duration.ofDays(5));
            var r = svc.registrarDevolucion(biblio, p.getIdPrestamo(), false);
            assertThat(r.prestamo().getEstado()).isEqualTo(EstadoPrestamo.FINALIZADO);
            assertThat(r.multa()).isNull();
            assertThat(r.diasRetraso()).isZero();
            verify(catalogo).devolver("R001", p.getIdPrestamo(), false);
        }

        @Test
        @DisplayName("PI14: 3 días tarde → multa PENDIENTE de $30.00 y alerta")
        void conRetraso() {
            Prestamo p = activo("R001");                 // fecha límite 16 oct
            reloj.avanzar(Duration.ofDays(10));          // 19 oct
            var r = svc.registrarDevolucion(biblio, p.getIdPrestamo(), false);
            assertThat(r.diasRetraso()).isEqualTo(3);
            assertThat(r.multa().getMontoCalculado()).isEqualByComparingTo("30.00");
            assertThat(r.multa().getEstadoPago()).isEqualTo(EstadoPago.PENDIENTE);
            assertThat(r.multa().getIdMulta()).matches("M-\\d{4}");
            verify(notificaciones).crear(argThat(m -> "ALERTA_MULTA".equals(m.get("tipo"))), anyString());
        }

        @Test
        @DisplayName("Los días se cuentan en hora de México, no en UTC")
        void zonaHoraria() {
            Prestamo p = activo("R001");                                   // límite 16 oct
            reloj.fijar(java.time.Instant.parse("2026-10-17T05:00:00Z"));  // 16 oct, 23:00 en León
            var r = svc.registrarDevolucion(biblio, p.getIdPrestamo(), false);
            assertThat(r.diasRetraso()).isZero();
            assertThat(r.multa()).isNull();
        }

        @Test
        @DisplayName("CU05-A2: devolver dos veces → 409 y no duplica la multa")
        void dobleDevolucion() {
            Prestamo p = activo("R001");
            reloj.avanzar(Duration.ofDays(10));
            svc.registrarDevolucion(biblio, p.getIdPrestamo(), false);
            assertThat(error(() -> svc.registrarDevolucion(biblio, p.getIdPrestamo(), false)).getCodigo())
                    .isEqualTo("PRESTAMO_FINALIZADO");
            assertThat(multas.count()).isEqualTo(1);
        }

        @Test
        @DisplayName("CU05-A3: recurso dañado se envía a mantenimiento")
        void danado() {
            Prestamo p = activo("R001");
            svc.registrarDevolucion(biblio, p.getIdPrestamo(), true);
            verify(catalogo).devolver("R001", p.getIdPrestamo(), true);
        }
    }

    @Nested
    @DisplayName("CU06 · Renovar (PI15)")
    class Renovar {

        @Test
        void renovacionValida() {
            Prestamo p = activo("R001");
            Prestamo r = svc.renovar(alumno, p.getIdPrestamo());
            assertThat(r.getFechaDevolucionEstimada()).isEqualTo(LocalDate.of(2026, 10, 23));
            assertThat(r.getRenovaciones()).isEqualTo(1);
        }

        @Test
        void segundaRenovacionRebasaElMaximo() {
            Prestamo p = activo("R001");
            svc.renovar(alumno, p.getIdPrestamo());
            assertThat(error(() -> svc.renovar(alumno, p.getIdPrestamo())).getCodigo()).isEqualTo("LIMITE_RENOVACIONES");
        }

        @Test
        void vencidoNoSeRenueva() {
            Prestamo p = activo("R001");
            reloj.avanzar(Duration.ofDays(8));
            assertThat(error(() -> svc.renovar(alumno, p.getIdPrestamo())).getCodigo()).isEqualTo("PRESTAMO_VENCIDO");
        }

        @Test
        void conDemandaDeOtroUsuarioNoSeRenueva() {
            Prestamo p = activo("R001");
            when(catalogo.obtener("R001")).thenReturn(new RecursoInfo("R001", "t", "LIBRO", 0, "PRESTADO"));
            reloj.avanzar(Duration.ofHours(2));
            error(() -> svc.solicitar(otroAlumno, "R001"));
            assertThat(error(() -> svc.renovar(alumno, p.getIdPrestamo())).getCodigo()).isEqualTo("RESERVA_PENDIENTE");
        }

        @Test
        void conMultaPendienteNoSeRenueva() {
            Prestamo viejo = activo("R001");
            Prestamo nuevo = svc.aprobarEntrega(biblio, svc.solicitar(alumno, "R002").getIdPrestamo());
            reloj.avanzar(Duration.ofDays(8));
            svc.registrarDevolucion(biblio, viejo.getIdPrestamo(), false);   // genera multa
            jdbc.update("UPDATE prestamo SET fecha_devolucion_estimada = ? WHERE id_prestamo = ?",
                    LocalDate.of(2026, 10, 30), nuevo.getIdPrestamo());
            assertThat(error(() -> svc.renovar(alumno, nuevo.getIdPrestamo())).getCodigo()).isEqualTo("MULTA_PENDIENTE");
        }

        @Test
        void prestamoAjeno403() {
            Prestamo p = activo("R001");
            assertThat(error(() -> svc.renovar(otroAlumno, p.getIdPrestamo())).getStatus()).isEqualTo(403);
        }
    }

    @Nested
    @DisplayName("CU07 · Historial (PI16)")
    class Historial {

        @Test
        void elAlumnoSoloVeLoSuyo() {
            svc.solicitar(alumno, "R001");
            svc.solicitar(otroAlumno, "R002");
            assertThat(svc.listar(alumno, null, null, null, 1, 20).getContent())
                    .allMatch(p -> p.getIdUsuario().equals("U123")).hasSize(1);
            assertThat(error(() -> svc.listar(alumno, "U124", null, null, 1, 20)).getStatus()).isEqualTo(403);
        }

        @Test
        void elBibliotecarioVeTodoYFiltra() {
            svc.solicitar(alumno, "R001");
            Prestamo otro = svc.solicitar(otroAlumno, "R002");
            assertThat(svc.listar(biblio, null, null, null, 1, 20).getTotalElements()).isEqualTo(2);
            assertThat(svc.listar(biblio, "U124", null, null, 1, 20).getTotalElements()).isEqualTo(1);
            assertThat(svc.listar(biblio, null, null, otro.getIdPrestamo().toLowerCase(), 1, 20).getContent())
                    .extracting(Prestamo::getIdPrestamo).containsExactly(otro.getIdPrestamo());
            assertThat(svc.listar(biblio, null, EstadoPrestamo.ACTIVO, null, 1, 20).getTotalElements()).isZero();
        }

        @Test
        void detalleAjeno403() {
            Prestamo p = svc.solicitar(alumno, "R001");
            assertThat(error(() -> svc.detalle(otroAlumno, p.getIdPrestamo())).getStatus()).isEqualTo(403);
            assertThat(svc.detalle(biblio, p.getIdPrestamo())).isNotNull();
        }
    }

    @Nested
    @DisplayName("CU09 · Tareas programadas")
    class Tareas {

        @Test
        @DisplayName("PI17: recordatorio un día antes y VENCIDO al día siguiente del límite")
        void recordatoriosYVencimientos() {
            Prestamo p = activo("R001");                       // límite 16 oct
            reloj.avanzar(Duration.ofDays(6));                 // 15 oct
            assertThat(svc.detectarVencimientos()).containsExactly(1, 0);
            reloj.avanzar(Duration.ofDays(2));                 // 17 oct
            assertThat(svc.detectarVencimientos()).containsExactly(0, 1);
            assertThat(prestamos.findById(p.getIdPrestamo()).orElseThrow().getEstado()).isEqualTo(EstadoPrestamo.VENCIDO);
        }

        @Test
        @DisplayName("CU09-A3: correr la tarea dos veces no duplica avisos")
        void idempotente() {
            activo("R001");
            reloj.avanzar(Duration.ofDays(6));
            svc.detectarVencimientos();
            long antes = eventos.count();
            assertThat(svc.detectarVencimientos()).containsExactly(0, 0);
            assertThat(eventos.count()).isEqualTo(antes);
        }

        @Test
        @DisplayName("RN04: las reservas no recogidas se rechazan y se liberan")
        void expirarReservas() {
            Prestamo p = svc.solicitar(alumno, "R001");
            reloj.avanzar(Duration.ofHours(71));
            assertThat(svc.expirarReservas()).isZero();
            reloj.avanzar(Duration.ofHours(2));
            assertThat(svc.expirarReservas()).isEqualTo(1);
            assertThat(prestamos.findById(p.getIdPrestamo()).orElseThrow().getEstado()).isEqualTo(EstadoPrestamo.RECHAZADO);
            verify(catalogo).liberar("R001", p.getIdPrestamo());
        }
    }

    @Nested
    @DisplayName("Multas")
    class Multas {

        @Test
        void elBibliotecarioRegistraElPagoYElUsuarioPuedeVolverAPedir() {
            Prestamo p = activo("R001");
            reloj.avanzar(Duration.ofDays(10));
            Multa m = svc.registrarDevolucion(biblio, p.getIdPrestamo(), false).multa();
            assertThat(error(() -> multaSvc.resolver(alumno, m.getIdMulta(), EstadoPago.PAGADA)).getStatus()).isEqualTo(403);
            assertThat(multaSvc.resolver(biblio, m.getIdMulta(), EstadoPago.PAGADA).getEstadoPago()).isEqualTo(EstadoPago.PAGADA);
            assertThat(svc.solicitar(alumno, "R002").getEstado()).isEqualTo(EstadoPrestamo.PENDIENTE_ENTREGA);
        }

        @Test
        void elAlumnoSoloVeSusMultas() {
            Prestamo p = activo("R001");
            reloj.avanzar(Duration.ofDays(10));
            svc.registrarDevolucion(biblio, p.getIdPrestamo(), false);
            assertThat(multaSvc.listar(alumno, null, null, 1, 20).getTotalElements()).isEqualTo(1);
            assertThat(multaSvc.listar(otroAlumno, null, null, 1, 20).getTotalElements()).isZero();
            assertThat(error(() -> multaSvc.listar(otroAlumno, "U123", null, 1, 20)).getStatus()).isEqualTo(403);
        }
    }

    @Test
    @DisplayName("D5: si falla el guardado después de reservar, se libera la reserva")
    void compensacion() {
        jdbc.execute("ALTER TABLE prestamo ADD CONSTRAINT ck_prueba_falla CHECK (id_recurso <> 'R-FALLA')");
        try {
            assertThatThrownBy(() -> svc.solicitar(alumno, "R-FALLA")).isInstanceOf(RuntimeException.class);
            verify(catalogo).liberar(eq("R-FALLA"), anyString());
        } finally {
            jdbc.execute("ALTER TABLE prestamo DROP CONSTRAINT ck_prueba_falla");
        }
    }

    @Test
    @DisplayName("Un 4xx al reintentar (p. ej. reserva ya cerrada) deja el evento FALLIDO para revisión")
    void eventoCon4xx() {
        doThrow(new RemotoException(409, "TRANSICION_INVALIDA", "no")).when(catalogo).entregar(anyString(), anyString());
        Prestamo p = svc.solicitar(alumno, "R001");
        svc.aprobarEntrega(biblio, p.getIdPrestamo());
        assertThat(eventos.findAll()).anyMatch(e -> e.getTipo() == EventoPendiente.Tipo.CATALOGO_ENTREGA
                && e.getEstado() == EventoPendiente.Estado.FALLIDO);
    }
}
