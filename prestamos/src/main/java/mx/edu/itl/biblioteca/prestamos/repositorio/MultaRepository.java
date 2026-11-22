package mx.edu.itl.biblioteca.prestamos.repositorio;

import jakarta.persistence.criteria.Predicate;
import java.util.ArrayList;
import java.util.List;
import mx.edu.itl.biblioteca.prestamos.dominio.EstadoPago;
import mx.edu.itl.biblioteca.prestamos.dominio.Multa;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

public interface MultaRepository extends JpaRepository<Multa, String>, JpaSpecificationExecutor<Multa> {

    @Query(value = "SELECT nextval('multa_seq')", nativeQuery = true)
    long siguienteFolio();

    boolean existsByIdUsuarioAndEstadoPago(String idUsuario, EstadoPago estadoPago);

    List<Multa> findByIdPrestamoIn(List<String> idsPrestamo);

    /** Búsqueda con filtros opcionales (ver PrestamoRepository.buscar). */
    default Page<Multa> buscar(String idUsuario, EstadoPago estado, Pageable pageable) {
        Specification<Multa> filtros = (root, query, cb) -> {
            List<Predicate> condiciones = new ArrayList<>();
            if (idUsuario != null) {
                condiciones.add(cb.equal(root.get("idUsuario"), idUsuario));
            }
            if (estado != null) {
                condiciones.add(cb.equal(root.get("estadoPago"), estado));
            }
            return cb.and(condiciones.toArray(new Predicate[0]));
        };
        return findAll(filtros, PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(),
                Sort.by(Sort.Direction.DESC, "fechaGeneracion")));
    }
}
