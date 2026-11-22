package mx.edu.itl.biblioteca.prestamos.dominio;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Fila de candado por usuario (RN03). Se bloquea con SELECT ... FOR UPDATE dentro de la transacción
 * que guarda una solicitud, para que dos solicitudes simultáneas del mismo usuario se revisen una tras otra.
 */
@Entity
@Table(name = "cupo_usuario")
public class CupoUsuario {

    @Id
    @Column(name = "id_usuario")
    private String idUsuario;

    protected CupoUsuario() { }

    public String getIdUsuario() { return idUsuario; }
}
