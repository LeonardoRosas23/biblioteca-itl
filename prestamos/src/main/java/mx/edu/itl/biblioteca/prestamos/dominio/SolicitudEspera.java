package mx.edu.itl.biblioteca.prestamos.dominio;

import jakarta.persistence.*;
import java.time.Instant;

/** Demanda no atendida de un recurso: se usa para la regla "no hay solicitudes en espera" (RN06). */
@Entity
@Table(name = "solicitud_espera")
public class SolicitudEspera {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id_solicitud")
    private Long idSolicitud;
    @Column(name = "id_recurso", nullable = false)
    private String idRecurso;
    @Column(name = "id_usuario", nullable = false)
    private String idUsuario;
    @Column(name = "fecha_registro", nullable = false)
    private Instant fechaRegistro;
    @Column(nullable = false)
    private boolean atendida;

    protected SolicitudEspera() { }

    public SolicitudEspera(String idRecurso, String idUsuario, Instant ahora) {
        this.idRecurso = idRecurso;
        this.idUsuario = idUsuario;
        this.fechaRegistro = ahora;
    }

    public void atender() { this.atendida = true; }

    public String getIdRecurso() { return idRecurso; }
    public String getIdUsuario() { return idUsuario; }
    public boolean isAtendida() { return atendida; }
}
