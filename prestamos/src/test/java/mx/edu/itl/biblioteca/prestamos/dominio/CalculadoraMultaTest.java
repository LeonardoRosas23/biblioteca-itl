package mx.edu.itl.biblioteca.prestamos.dominio;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDate;
import mx.edu.itl.biblioteca.prestamos.config.ParametrosNegocio;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

@DisplayName("RN07 · Cálculo de multas")
class CalculadoraMultaTest {

    private static final LocalDate LIMITE = LocalDate.of(2026, 10, 6);

    private static ParametrosNegocio params(int tolerancia, String tope) {
        return new ParametrosNegocio("America/Mexico_City", 3, 7, 3, 3, 1, 72,
                new BigDecimal("10.00"), tolerancia, new BigDecimal(tope), 1, 7);
    }

    @Test
    @DisplayName("Ejemplo del documento: 3 días × $10.00 = $30.00 (PI14)")
    void ejemploDelDocumento() {
        var r = CalculadoraMulta.calcular(LIMITE, LocalDate.of(2026, 10, 9), ParametrosNegocio.ejemplo());
        assertThat(r).isPresent();
        assertThat(r.get().diasRetraso()).isEqualTo(3);
        assertThat(r.get().monto()).isEqualByComparingTo("30.00");
    }

    @ParameterizedTest(name = "devuelto el {0} → sin multa")
    @CsvSource({"2026-10-01", "2026-10-06"})
    void aTiempoNoGeneraMulta(LocalDate devolucion) {
        assertThat(CalculadoraMulta.calcular(LIMITE, devolucion, ParametrosNegocio.ejemplo())).isEmpty();
    }

    @Test
    void retrasoDentroDeLaToleranciaNoGeneraMulta() {
        assertThat(CalculadoraMulta.calcular(LIMITE, LIMITE.plusDays(2), params(2, "0"))).isEmpty();
    }

    @Test
    void retrasoQueSuperaLaToleranciaCobraTodosLosDias() {
        var r = CalculadoraMulta.calcular(LIMITE, LIMITE.plusDays(3), params(2, "0")).orElseThrow();
        assertThat(r.monto()).isEqualByComparingTo("30.00");
    }

    @Test
    void elTopeLimitaElMonto() {
        var r = CalculadoraMulta.calcular(LIMITE, LIMITE.plusDays(30), params(0, "100")).orElseThrow();
        assertThat(r.diasRetraso()).isEqualTo(30);
        assertThat(r.monto()).isEqualByComparingTo("100.00");
    }

    @Test
    void sinTopeElMontoCreceConLosDias() {
        var r = CalculadoraMulta.calcular(LIMITE, LIMITE.plusDays(30), ParametrosNegocio.ejemplo()).orElseThrow();
        assertThat(r.monto()).isEqualByComparingTo("300.00");
    }

    @Test
    void conservaLaTarifaVigenteConDosDecimales() {
        var r = CalculadoraMulta.calcular(LIMITE, LIMITE.plusDays(1), ParametrosNegocio.ejemplo()).orElseThrow();
        assertThat(r.tarifaDiaria()).isEqualTo(new BigDecimal("10.00"));
        assertThat(r.monto().scale()).isEqualTo(2);
    }

    @Test
    void diasRetrasoNuncaEsNegativo() {
        assertThat(CalculadoraMulta.diasRetraso(LIMITE, LIMITE.minusDays(5))).isZero();
    }
}
