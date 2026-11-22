package mx.edu.itl.biblioteca.prestamos.dominio;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("D6 · Reintentos de la bandeja de salida")
class EventoPendienteTest {

    private static final Instant T0 = Instant.parse("2026-11-04T12:00:00Z");

    private EventoPendiente nuevo() {
        return new EventoPendiente(EventoPendiente.Tipo.NOTIFICACION, "{}", "CONFIRMACION:P-1", T0);
    }

    @Test
    void naceListoParaEnviarse() {
        EventoPendiente e = nuevo();
        assertThat(e.getEstado()).isEqualTo(EventoPendiente.Estado.PENDIENTE);
        assertThat(e.getProximoIntento()).isEqualTo(T0);
    }

    @Test
    void cadaFalloDuplicaLaEspera() {
        EventoPendiente e = nuevo();
        e.registrarFallo("timeout", T0, 8);
        assertThat(Duration.between(T0, e.getProximoIntento())).isEqualTo(Duration.ofSeconds(30));
        e.registrarFallo("timeout", T0, 8);
        assertThat(Duration.between(T0, e.getProximoIntento())).isEqualTo(Duration.ofSeconds(60));
        e.registrarFallo("timeout", T0, 8);
        assertThat(Duration.between(T0, e.getProximoIntento())).isEqualTo(Duration.ofSeconds(120));
        assertThat(e.getIntentos()).isEqualTo(3);
        assertThat(e.getEstado()).isEqualTo(EventoPendiente.Estado.PENDIENTE);
    }

    @Test
    void alAgotarIntentosQuedaFallido() {
        EventoPendiente e = nuevo();
        for (int i = 0; i < 3; i++) {
            e.registrarFallo("caído", T0, 3);
        }
        assertThat(e.getEstado()).isEqualTo(EventoPendiente.Estado.FALLIDO);
        assertThat(e.getUltimoError()).isEqualTo("caído");
    }

    @Test
    void elErrorSeRecortaA300Caracteres() {
        EventoPendiente e = nuevo();
        e.registrarFallo("x".repeat(1000), T0, 8);
        assertThat(e.getUltimoError()).hasSize(300);
    }

    @Test
    void enviadoLimpiaElError() {
        EventoPendiente e = nuevo();
        e.registrarFallo("caído", T0, 8);
        e.marcarEnviado(T0);
        assertThat(e.getEstado()).isEqualTo(EventoPendiente.Estado.ENVIADO);
        assertThat(e.getUltimoError()).isNull();
    }
}
