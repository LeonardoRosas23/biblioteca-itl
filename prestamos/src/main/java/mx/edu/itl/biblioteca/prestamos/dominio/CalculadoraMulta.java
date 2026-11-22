package mx.edu.itl.biblioteca.prestamos.dominio;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import mx.edu.itl.biblioteca.prestamos.config.ParametrosNegocio;

/**
 * RN07: si los días de retraso superan la tolerancia, la multa es
 * días de retraso × tarifa diaria, limitada por el tope cuando existe.
 * Las fechas se comparan en la zona horaria de la biblioteca, no en UTC.
 */
public final class CalculadoraMulta {

    public record Resultado(int diasRetraso, BigDecimal tarifaDiaria, BigDecimal monto) { }

    private CalculadoraMulta() { }

    public static int diasRetraso(LocalDate fechaLimite, LocalDate fechaDevolucion) {
        long dias = ChronoUnit.DAYS.between(fechaLimite, fechaDevolucion);
        return (int) Math.max(0, dias);
    }

    public static Optional<Resultado> calcular(LocalDate fechaLimite, LocalDate fechaDevolucion, ParametrosNegocio p) {
        int dias = diasRetraso(fechaLimite, fechaDevolucion);
        if (dias == 0 || dias <= p.diasTolerancia()) {
            return Optional.empty();
        }
        BigDecimal monto = p.tarifaDiaria().multiply(BigDecimal.valueOf(dias));
        if (p.tieneTope() && monto.compareTo(p.topeMulta()) > 0) {
            monto = p.topeMulta();
        }
        return Optional.of(new Resultado(dias, p.tarifaDiaria().setScale(2, RoundingMode.HALF_UP),
                monto.setScale(2, RoundingMode.HALF_UP)));
    }
}
