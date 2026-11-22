package mx.edu.itl.biblioteca.prestamos.repositorio;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import mx.edu.itl.biblioteca.prestamos.dominio.EventoPendiente;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EventoRepository extends JpaRepository<EventoPendiente, Long> {

    boolean existsByClaveIdempotencia(String clave);

    List<EventoPendiente> findByEstadoAndProximoIntentoLessThanEqualOrderByIdEventoAsc(
            EventoPendiente.Estado estado, Instant ahora, Pageable pageable);

    long countByEstado(EventoPendiente.Estado estado);

    /** ¿Hay un cambio de Catálogo anterior del mismo préstamo que aún no se aplica? */
    boolean existsByIdPrestamoAndTipoInAndEstadoInAndIdEventoLessThan(
            String idPrestamo, Collection<EventoPendiente.Tipo> tipos,
            Collection<EventoPendiente.Estado> estados, Long idEvento);
}
