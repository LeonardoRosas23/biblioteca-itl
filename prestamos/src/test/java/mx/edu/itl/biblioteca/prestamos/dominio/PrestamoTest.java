package mx.edu.itl.biblioteca.prestamos.dominio;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import mx.edu.itl.biblioteca.prestamos.comun.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("Figura 4.2 · Máquina de estados del préstamo")
class PrestamoTest {

    private static final Instant T0 = Instant.parse("2026-10-09T16:15:00Z");
    private static final LocalDate HOY = LocalDate.of(2026, 10, 9);
    private Prestamo p;

    @BeforeEach
    void nuevo() {
        p = Prestamo.solicitar("P-0101", "U123", "R001", "Cálculo diferencial", "LIBRO",
                T0, T0.plus(Duration.ofHours(72)), HOY.plusDays(7));
    }

    private static String codigo(Runnable r) {
        try {
            r.run();
            return null;
        } catch (ApiException e) {
            assertThat(e.getStatus()).isEqualTo(409);
            return e.getCodigo();
        }
    }

    @Test
    void naceEnPendienteDeEntrega() {
        assertThat(p.getEstado()).isEqualTo(EstadoPrestamo.PENDIENTE_ENTREGA);
        assertThat(p.getRenovaciones()).isZero();
    }

    @Nested
    @DisplayName("Aprobar entrega (CU04)")
    class Aprobar {
        @Test
        void conReservaVigentePasaAActivoYFijaFechaLimite() {
            p.aprobarEntrega(T0.plus(Duration.ofHours(1)), HOY.plusDays(7));
            assertThat(p.getEstado()).isEqualTo(EstadoPrestamo.ACTIVO);
            assertThat(p.getFechaDevolucionEstimada()).isEqualTo(LocalDate.of(2026, 10, 16));
            assertThat(p.getFechaEntrega()).isNotNull();
        }

        @Test
        void conReservaExpiradaDa409() {
            assertThat(codigo(() -> p.aprobarEntrega(T0.plus(Duration.ofHours(73)), HOY)))
                    .isEqualTo("RESERVA_EXPIRADA");
            assertThat(p.getEstado()).isEqualTo(EstadoPrestamo.PENDIENTE_ENTREGA);
        }

        @Test
        void noSePuedeAprobarDosVeces() {
            p.aprobarEntrega(T0, HOY.plusDays(7));
            assertThat(codigo(() -> p.aprobarEntrega(T0, HOY))).isEqualTo("PRESTAMO_NO_PENDIENTE");
        }
    }

    @Test
    void rechazoGuardaMotivoYEsFinal() {
        p.rechazar("RESERVA_EXPIRADA");
        assertThat(p.getEstado()).isEqualTo(EstadoPrestamo.RECHAZADO);
        assertThat(p.getMotivo()).isEqualTo("RESERVA_EXPIRADA");
        assertThat(codigo(() -> p.aprobarEntrega(T0, HOY))).isNotNull();
        assertThat(codigo(() -> p.registrarDevolucion(T0, false))).isEqualTo("PRESTAMO_NO_ACTIVO");
    }

    @Nested
    @DisplayName("Vencimiento (RN08)")
    class Vencimiento {
        @BeforeEach
        void activo() { p.aprobarEntrega(T0, HOY.plusDays(7)); }

        @Test
        void elMismoDiaLimiteNoEstaVencido() {
            assertThat(p.marcarVencidoSiCorresponde(HOY.plusDays(7))).isFalse();
            assertThat(p.getEstado()).isEqualTo(EstadoPrestamo.ACTIVO);
        }

        @Test
        void alDiaSiguienteSeMarcaVencido() {
            assertThat(p.marcarVencidoSiCorresponde(HOY.plusDays(8))).isTrue();
            assertThat(p.getEstado()).isEqualTo(EstadoPrestamo.VENCIDO);
        }

        @Test
        void unPendienteNoSeVence() {
            Prestamo pendiente = Prestamo.solicitar("P-2", "U1", "R1", "t", "LIBRO", T0, T0, HOY);
            assertThat(pendiente.marcarVencidoSiCorresponde(HOY.plusDays(30))).isFalse();
        }
    }

    @Nested
    @DisplayName("Devolución (CU05)")
    class Devolucion {
        @Test
        void activoPasaAFinalizado() {
            p.aprobarEntrega(T0, HOY.plusDays(7));
            p.registrarDevolucion(T0.plus(Duration.ofDays(3)), true);
            assertThat(p.getEstado()).isEqualTo(EstadoPrestamo.FINALIZADO);
            assertThat(p.isRecursoDanado()).isTrue();
            assertThat(p.getFechaDevolucionReal()).isNotNull();
        }

        @Test
        void vencidoTambienSePuedeDevolver() {
            p.aprobarEntrega(T0, HOY.plusDays(7));
            p.marcarVencidoSiCorresponde(HOY.plusDays(10));
            p.registrarDevolucion(T0, false);
            assertThat(p.getEstado()).isEqualTo(EstadoPrestamo.FINALIZADO);
        }

        @Test
        void devolverDosVecesDa409YNoDuplica() {
            p.aprobarEntrega(T0, HOY.plusDays(7));
            p.registrarDevolucion(T0, false);
            assertThat(codigo(() -> p.registrarDevolucion(T0, false))).isEqualTo("PRESTAMO_FINALIZADO");
        }

        @Test
        void unPendienteNoSePuedeDevolver() {
            assertThat(codigo(() -> p.registrarDevolucion(T0, false))).isEqualTo("PRESTAMO_NO_ACTIVO");
        }
    }

    @Nested
    @DisplayName("Renovación (CU06)")
    class Renovacion {
        @BeforeEach
        void activo() { p.aprobarEntrega(T0, HOY.plusDays(7)); }

        @Test
        void extiendeLaFechaYCuentaLaRenovacion() {
            p.renovar(HOY.plusDays(14), 1, HOY);
            assertThat(p.getFechaDevolucionEstimada()).isEqualTo(HOY.plusDays(14));
            assertThat(p.getRenovaciones()).isEqualTo(1);
        }

        @Test
        void respetaElMaximoDeRenovaciones() {
            p.renovar(HOY.plusDays(14), 1, HOY);
            assertThat(codigo(() -> p.renovar(HOY.plusDays(21), 1, HOY))).isEqualTo("LIMITE_RENOVACIONES");
            assertThat(p.getRenovaciones()).isEqualTo(1);
        }

        @Test
        void unPrestamoConFechaPasadaNoSeRenuevaAunqueSigaActivo() {
            assertThat(codigo(() -> p.renovar(HOY.plusDays(20), 1, HOY.plusDays(8)))).isEqualTo("PRESTAMO_VENCIDO");
        }

        @Test
        void unPendienteNoSeRenueva() {
            Prestamo pendiente = Prestamo.solicitar("P-2", "U1", "R1", "t", "LIBRO", T0, T0, HOY.plusDays(7));
            assertThat(codigo(() -> pendiente.renovar(HOY.plusDays(14), 1, HOY))).isEqualTo("PRESTAMO_NO_ACTIVO");
        }
    }

    @Test
    void soloLosEstadosAbiertosOcupanCupo() {
        assertThat(EstadoPrestamo.PENDIENTE_ENTREGA.ocupaCupo()).isTrue();
        assertThat(EstadoPrestamo.ACTIVO.ocupaCupo()).isTrue();
        assertThat(EstadoPrestamo.VENCIDO.ocupaCupo()).isTrue();
        assertThat(EstadoPrestamo.FINALIZADO.ocupaCupo()).isFalse();
        assertThat(EstadoPrestamo.RECHAZADO.ocupaCupo()).isFalse();
    }

    @Test
    void multaSoloSeResuelveUnaVez() {
        p.aprobarEntrega(T0, HOY);
        var calc = CalculadoraMulta.calcular(HOY, HOY.plusDays(2),
                mx.edu.itl.biblioteca.prestamos.config.ParametrosNegocio.ejemplo()).orElseThrow();
        Multa m = new Multa("M-0001", p, calc, T0);
        m.resolver(EstadoPago.PAGADA, T0);
        assertThat(m.getEstadoPago()).isEqualTo(EstadoPago.PAGADA);
        assertThatThrownBy(() -> m.resolver(EstadoPago.CANCELADA, T0))
                .isInstanceOf(ApiException.class).hasMessageContaining("PAGADA");
    }
}
