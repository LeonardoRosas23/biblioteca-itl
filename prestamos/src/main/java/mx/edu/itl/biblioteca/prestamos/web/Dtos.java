package mx.edu.itl.biblioteca.prestamos.web;

import jakarta.validation.constraints.NotBlank;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.function.Function;
import mx.edu.itl.biblioteca.prestamos.dominio.EstadoPago;
import mx.edu.itl.biblioteca.prestamos.dominio.Multa;
import mx.edu.itl.biblioteca.prestamos.dominio.Prestamo;
import org.springframework.data.domain.Page;

/** Contratos JSON de la sección 5.6 (camelCase, sin acentos, fechas ISO 8601). */
public final class Dtos {

    private Dtos() { }

    public record SolicitudPrestamo(@NotBlank String idRecurso) { }

    public record DevolucionRequest(Boolean danado) {
        public boolean esDanado() { return Boolean.TRUE.equals(danado); }
    }

    public record CambioMulta(EstadoPago estadoPago) { }

    public record MultaDto(String idMulta, String idPrestamo, String idUsuario, int diasRetraso,
                           BigDecimal tarifaDiaria, BigDecimal montoCalculado, EstadoPago estadoPago,
                           Instant fechaGeneracion, Instant fechaResolucion) {
        public static MultaDto de(Multa m) {
            if (m == null) return null;
            return new MultaDto(m.getIdMulta(), m.getIdPrestamo(), m.getIdUsuario(), m.getDiasRetraso(),
                    m.getTarifaDiaria(), m.getMontoCalculado(), m.getEstadoPago(), m.getFechaGeneracion(),
                    m.getFechaResolucion());
        }
    }

    public record PrestamoDto(String idPrestamo, String idUsuario, String idRecurso, String tituloRecurso,
                              String categoriaRecurso, String estado, String motivo, Instant fechaSolicitud,
                              Instant reservaVigenteHasta, Instant fechaEntrega, LocalDate fechaDevolucionEstimada,
                              Instant fechaDevolucionReal, int renovaciones, boolean recursoDanado, MultaDto multa) {
        public static PrestamoDto de(Prestamo p, Multa multa) {
            return new PrestamoDto(p.getIdPrestamo(), p.getIdUsuario(), p.getIdRecurso(), p.getTituloRecurso(),
                    p.getCategoriaRecurso(), p.getEstado().name(), p.getMotivo(), p.getFechaSolicitud(),
                    p.getReservaVigenteHasta(), p.getFechaEntrega(), p.getFechaDevolucionEstimada(),
                    p.getFechaDevolucionReal(), p.getRenovaciones(), p.isRecursoDanado(), MultaDto.de(multa));
        }
    }

    public record DevolucionDto(String idPrestamo, String estado, Instant fechaDevolucionReal, int diasRetraso,
                                MultaDto multa) { }

    public record Pagina<T>(List<T> items, int pagina, int tamano, long total) {
        public static <E, T> Pagina<T> de(Page<E> page, Function<E, T> f) {
            return new Pagina<>(page.getContent().stream().map(f).toList(), page.getNumber() + 1,
                    page.getSize(), page.getTotalElements());
        }
    }
}
