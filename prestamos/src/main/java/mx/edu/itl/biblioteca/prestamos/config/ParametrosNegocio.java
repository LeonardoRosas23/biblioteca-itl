package mx.edu.itl.biblioteca.prestamos.config;

import java.math.BigDecimal;
import java.time.ZoneId;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** Parámetros configurables de la sección 2.3, tomados de variables de entorno. */
@ConfigurationProperties(prefix = "negocio")
public record ParametrosNegocio(
        String zonaHoraria,
        int limitePrestamos,
        int diasPrestamoLibro,
        int diasPrestamoEquipo,
        int diasPrestamoLaboratorio,
        int maxRenovaciones,
        int horasReserva,
        BigDecimal tarifaDiaria,
        int diasTolerancia,
        BigDecimal topeMulta,
        int diasAviso,
        int diasEspera) {

    public ZoneId zona() {
        return ZoneId.of(zonaHoraria);
    }

    /** RN05: días de préstamo según la categoría del recurso. */
    public int diasPrestamo(String categoria) {
        return switch (categoria == null ? "" : categoria.toUpperCase()) {
            case "EQUIPO" -> diasPrestamoEquipo;
            case "LABORATORIO" -> diasPrestamoLaboratorio;
            default -> diasPrestamoLibro;
        };
    }

    public boolean tieneTope() {
        return topeMulta != null && topeMulta.signum() > 0;
    }

    /** Valores de ejemplo del documento de diseño; útiles en pruebas. */
    public static ParametrosNegocio ejemplo() {
        return new ParametrosNegocio("America/Mexico_City", 3, 7, 3, 3, 1, 72,
                new BigDecimal("10.00"), 0, BigDecimal.ZERO, 1, 7);
    }
}
