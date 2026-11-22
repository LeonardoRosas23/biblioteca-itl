package mx.edu.itl.biblioteca.prestamos.repositorio;

import jakarta.persistence.criteria.Predicate;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import mx.edu.itl.biblioteca.prestamos.dominio.EstadoPrestamo;
import mx.edu.itl.biblioteca.prestamos.dominio.Prestamo;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

public interface PrestamoRepository extends JpaRepository<Prestamo, String>, JpaSpecificationExecutor<Prestamo> {

    @Query(value = "SELECT nextval('prestamo_seq')", nativeQuery = true)
    long siguienteFolio();

    long countByIdUsuarioAndEstadoIn(String idUsuario, Collection<EstadoPrestamo> estados);

    boolean existsByIdUsuarioAndEstado(String idUsuario, EstadoPrestamo estado);

    /** Préstamo ACTIVO cuya fecha límite ya pasó aunque la tarea diaria aún no lo marque VENCIDO. */
    boolean existsByIdUsuarioAndEstadoAndFechaDevolucionEstimadaBefore(String idUsuario, EstadoPrestamo estado, LocalDate hoy);

    boolean existsByIdUsuarioAndIdRecursoAndEstadoIn(String idUsuario, String idRecurso, Collection<EstadoPrestamo> estados);

    /**
     * Búsqueda con filtros opcionales. Solo se agrega la condición de cada filtro que trae valor:
     * PostgreSQL no acepta parámetros nulos sin tipo en expresiones como LOWER(?).
     */
    default Page<Prestamo> buscar(String idUsuario, EstadoPrestamo estado, String folio, Pageable pageable) {
        Specification<Prestamo> filtros = (root, query, cb) -> {
            List<Predicate> condiciones = new ArrayList<>();
            if (idUsuario != null) {
                condiciones.add(cb.equal(root.get("idUsuario"), idUsuario));
            }
            if (estado != null) {
                condiciones.add(cb.equal(root.get("estado"), estado));
            }
            if (folio != null) {
                condiciones.add(cb.equal(cb.lower(root.<String>get("idPrestamo")), folio.toLowerCase()));
            }
            return cb.and(condiciones.toArray(new Predicate[0]));
        };
        return findAll(filtros, PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(),
                Sort.by(Sort.Direction.DESC, "fechaSolicitud")));
    }

    /** CU09: préstamos activos que vencen dentro de la ventana de aviso. */
    List<Prestamo> findByEstadoAndFechaDevolucionEstimadaBetween(EstadoPrestamo estado, LocalDate desde, LocalDate hasta);

    /** RN08: préstamos activos con fecha límite ya superada. */
    List<Prestamo> findByEstadoAndFechaDevolucionEstimadaBefore(EstadoPrestamo estado, LocalDate hoy);

    /** RN04: solicitudes cuya reserva ya expiró. */
    List<Prestamo> findByEstadoAndReservaVigenteHastaBefore(EstadoPrestamo estado, Instant ahora);
}
