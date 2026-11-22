package mx.edu.itl.biblioteca.prestamos.web;

import static org.hamcrest.Matchers.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Date;
import mx.edu.itl.biblioteca.prestamos.BasePrueba;
import mx.edu.itl.biblioteca.prestamos.integracion.Clientes.ServicioNoDisponibleException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@AutoConfigureMockMvc
@DisplayName("API de Préstamos · contrato HTTP, JWT y formato de errores")
class PrestamoApiTest extends BasePrueba {

    private static final String SECRETO = "secreto-de-pruebas-con-al-menos-32-bytes!!";

    @Autowired MockMvc mvc;

    private static String jwt(String sub, String rol, long segundos) {
        return "Bearer " + Jwts.builder().subject(sub).claim("rol", rol)
                .expiration(new Date(System.currentTimeMillis() + segundos * 1000))
                .signWith(Keys.hmacShaKeyFor(SECRETO.getBytes(StandardCharsets.UTF_8))).compact();
    }

    private static final String ALUMNO = jwt("U123", "ALUMNO", 3600);
    private static final String BIBLIO = jwt("U900", "BIBLIOTECARIO", 3600);

    private String solicitar(String token, String recurso) throws Exception {
        String json = mvc.perform(post("/api/v1/prestamos").header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"idRecurso\":\"" + recurso + "\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return json.replaceAll(".*\"idPrestamo\":\"(P-\\d+)\".*", "$1");
    }

    @Test
    @DisplayName("Contrato 5.6: POST /prestamos → 201 con los campos acordados")
    void contratoDeSolicitud() throws Exception {
        mvc.perform(post("/api/v1/prestamos").header("Authorization", ALUMNO).header("X-Correlation-Id", "7c1e9a52")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"idRecurso\":\"R001\"}"))
                .andExpect(status().isCreated())
                .andExpect(header().string("X-Correlation-Id", "7c1e9a52"))
                .andExpect(jsonPath("$.idPrestamo", matchesPattern("P-\\d{4}")))
                .andExpect(jsonPath("$.idUsuario").value("U123"))
                .andExpect(jsonPath("$.estado").value("PENDIENTE_ENTREGA"))
                .andExpect(jsonPath("$.tituloRecurso").value("Cálculo diferencial"))
                .andExpect(jsonPath("$.reservaVigenteHasta").value("2026-10-12T16:15:00Z"))
                .andExpect(jsonPath("$.fechaDevolucionEstimada").value("2026-10-16"));
    }

    @Test
    @DisplayName("D3: el idUsuario se toma del token aunque venga otro en el cuerpo")
    void idUsuarioDelToken() throws Exception {
        mvc.perform(post("/api/v1/prestamos").header("Authorization", ALUMNO)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"idRecurso\":\"R001\",\"idUsuario\":\"U999\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.idUsuario").value("U123"));
    }

    @Test
    @DisplayName("PI11: sin token, token alterado o vencido → 401 con formato común")
    void tokens() throws Exception {
        mvc.perform(get("/api/v1/prestamos")).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.codigo").value("NO_AUTENTICADO"))
                .andExpect(jsonPath("$.correlacionId").isNotEmpty());
        mvc.perform(get("/api/v1/prestamos").header("Authorization", ALUMNO + "x")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/prestamos").header("Authorization", jwt("U123", "ALUMNO", -60)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("PI06: un ALUMNO no puede aprobar entregas")
    void rolInsuficiente() throws Exception {
        String id = solicitar(ALUMNO, "R001");
        mvc.perform(patch("/api/v1/prestamos/" + id + "/aprobar").header("Authorization", ALUMNO))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.codigo").value("ACCESO_DENEGADO"));
    }

    @Test
    @DisplayName("Flujo completo: solicitar → aprobar → devolver con retraso → multa de $30.00")
    void flujoCompleto() throws Exception {
        String id = solicitar(ALUMNO, "R001");
        mvc.perform(patch("/api/v1/prestamos/" + id + "/aprobar").header("Authorization", BIBLIO))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.estado").value("ACTIVO"))
                .andExpect(jsonPath("$.fechaDevolucionEstimada").value("2026-10-16"));
        reloj.avanzar(Duration.ofDays(10));
        mvc.perform(post("/api/v1/prestamos/" + id + "/devolucion").header("Authorization", BIBLIO)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"danado\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.estado").value("FINALIZADO"))
                .andExpect(jsonPath("$.diasRetraso").value(3))
                .andExpect(jsonPath("$.multa.montoCalculado").value(30.00))
                .andExpect(jsonPath("$.multa.estadoPago").value("PENDIENTE"));
        mvc.perform(get("/api/v1/multas").header("Authorization", ALUMNO))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].idPrestamo").value(id));
        mvc.perform(get("/api/v1/prestamos").header("Authorization", ALUMNO))
                .andExpect(jsonPath("$.items[0].multa.montoCalculado").value(30.00));
    }

    @Test
    @DisplayName("PI16: ver el préstamo de otro usuario → 403")
    void historialAjeno() throws Exception {
        String id = solicitar(ALUMNO, "R001");
        mvc.perform(get("/api/v1/prestamos/" + id).header("Authorization", jwt("U124", "ALUMNO", 3600)))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/prestamos?idUsuario=U123").header("Authorization", BIBLIO))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1));
    }

    @Test
    @DisplayName("PI19: dependencia caída → 503 SERVICIO_NO_DISPONIBLE")
    void dependenciaCaida() throws Exception {
        when(usuarios.estadoCuenta(anyString())).thenThrow(new ServicioNoDisponibleException("Usuarios", null));
        mvc.perform(post("/api/v1/prestamos").header("Authorization", ALUMNO)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"idRecurso\":\"R001\"}"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.codigo").value("SERVICIO_NO_DISPONIBLE"));
    }

    @Test
    @DisplayName("Validación: cuerpo sin idRecurso, JSON roto y estado desconocido → 400")
    void validaciones() throws Exception {
        mvc.perform(post("/api/v1/prestamos").header("Authorization", ALUMNO)
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.codigo").value("DATOS_INVALIDOS"));
        mvc.perform(post("/api/v1/prestamos").header("Authorization", ALUMNO)
                        .contentType(MediaType.APPLICATION_JSON).content("{malo"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/prestamos?estado=PERDIDO").header("Authorization", ALUMNO))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("Préstamo inexistente → 404 PRESTAMO_NO_ENCONTRADO")
    void inexistente() throws Exception {
        mvc.perform(get("/api/v1/prestamos/P-9999").header("Authorization", BIBLIO))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.codigo").value("PRESTAMO_NO_ENCONTRADO"));
    }

    @Test
    @DisplayName("Renovación por HTTP y pago de multa por el personal")
    void renovacionYPago() throws Exception {
        String id = solicitar(ALUMNO, "R001");
        mvc.perform(patch("/api/v1/prestamos/" + id + "/aprobar").header("Authorization", BIBLIO)).andExpect(status().isOk());
        mvc.perform(post("/api/v1/prestamos/" + id + "/renovacion").header("Authorization", ALUMNO))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.renovaciones").value(1))
                .andExpect(jsonPath("$.fechaDevolucionEstimada").value("2026-10-23"));
        mvc.perform(post("/api/v1/prestamos/" + id + "/renovacion").header("Authorization", ALUMNO))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.codigo").value("LIMITE_RENOVACIONES"));
    }

    @Test
    @DisplayName("El endpoint de salud es público")
    void salud() throws Exception {
        mvc.perform(get("/actuator/health")).andExpect(status().isOk());
    }
}
