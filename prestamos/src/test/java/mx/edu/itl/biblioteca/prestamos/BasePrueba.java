package mx.edu.itl.biblioteca.prestamos;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;

import java.time.Instant;
import mx.edu.itl.biblioteca.prestamos.comun.Sesion;
import mx.edu.itl.biblioteca.prestamos.integracion.Clientes.*;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * Base de las pruebas con contexto de Spring: base H2 en memoria y los tres
 * microservicios externos simulados con Mockito (no se necesita red).
 */
@SpringBootTest(classes = {PrestamosApplication.class, BasePrueba.RelojPrueba.class})
@ActiveProfiles("test")
public abstract class BasePrueba {

    // 9 oct 2026, 10:15 hora de León (16:15 UTC), como en los ejemplos del documento
    public static final Instant T0 = Instant.parse("2026-10-09T16:15:00Z");

    @TestConfiguration
    public static class RelojPrueba {
        @Bean
        @Primary
        RelojAjustable relojAjustable() {
            return new RelojAjustable(T0);
        }
    }

    @MockitoBean protected UsuariosClient usuarios;
    @MockitoBean protected CatalogoClient catalogo;
    @MockitoBean protected NotificacionesClient notificaciones;

    @Autowired protected RelojAjustable reloj;
    @Autowired protected JdbcTemplate jdbc;

    protected final Sesion alumno = new Sesion("U123", "ALUMNO");
    protected final Sesion otroAlumno = new Sesion("U124", "ALUMNO");
    protected final Sesion biblio = new Sesion("U900", "BIBLIOTECARIO");

    @BeforeEach
    void limpiar() {
        jdbc.execute("DELETE FROM multa");
        jdbc.execute("DELETE FROM prestamo");
        jdbc.execute("DELETE FROM evento_pendiente");
        jdbc.execute("DELETE FROM solicitud_espera");
        jdbc.execute("DELETE FROM cupo_usuario");
        reset(usuarios, catalogo, notificaciones);
        reloj.fijar(T0);
        when(usuarios.estadoCuenta(anyString()))
                .thenAnswer(inv -> new EstadoCuenta(inv.getArgument(0), "Usuario", "ALUMNO", "ACTIVO"));
        when(catalogo.obtener(anyString()))
                .thenAnswer(inv -> new RecursoInfo(inv.getArgument(0), "Cálculo diferencial", "LIBRO", 2, "DISPONIBLE"));
    }

}
