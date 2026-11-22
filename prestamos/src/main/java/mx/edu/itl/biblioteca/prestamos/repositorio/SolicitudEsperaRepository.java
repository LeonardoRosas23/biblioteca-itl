package mx.edu.itl.biblioteca.prestamos.repositorio;

import java.time.Instant;
import java.util.List;
import mx.edu.itl.biblioteca.prestamos.dominio.SolicitudEspera;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SolicitudEsperaRepository extends JpaRepository<SolicitudEspera, Long> {

    boolean existsByIdRecursoAndAtendidaFalseAndIdUsuarioNotAndFechaRegistroAfter(
            String idRecurso, String idUsuarioExcluido, Instant desde);

    boolean existsByIdRecursoAndIdUsuarioAndAtendidaFalse(String idRecurso, String idUsuario);

    List<SolicitudEspera> findByIdRecursoAndIdUsuarioAndAtendidaFalse(String idRecurso, String idUsuario);
}
