package mx.edu.itl.biblioteca.prestamos.repositorio;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import mx.edu.itl.biblioteca.prestamos.dominio.CupoUsuario;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CupoUsuarioRepository extends JpaRepository<CupoUsuario, String> {

    /** Crea la fila del usuario si aún no existe (PostgreSQL y H2 en modo PostgreSQL). */
    @Modifying
    @Query(value = "INSERT INTO cupo_usuario (id_usuario) VALUES (:id) ON CONFLICT DO NOTHING", nativeQuery = true)
    int asegurar(@Param("id") String idUsuario);

    /** SELECT ... FOR UPDATE: espera a que termine cualquier otra solicitud del mismo usuario. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from CupoUsuario c where c.idUsuario = :id")
    Optional<CupoUsuario> bloquear(@Param("id") String idUsuario);
}
