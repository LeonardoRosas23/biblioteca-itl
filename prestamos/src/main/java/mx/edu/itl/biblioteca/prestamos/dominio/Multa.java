package mx.edu.itl.biblioteca.prestamos.dominio;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import mx.edu.itl.biblioteca.prestamos.comun.ApiException;
import org.springframework.data.domain.Persistable;

@Entity
@Table(name = "multa")
public class Multa implements Persistable<String> {

    @Id
    @Column(name = "id_multa")
    private String idMulta;
    @Column(name = "id_prestamo", nullable = false)
    private String idPrestamo;
    @Column(name = "id_usuario", nullable = false)
    private String idUsuario;
    @Column(name = "dias_retraso", nullable = false)
    private int diasRetraso;
    @Column(name = "tarifa_diaria", nullable = false)
    private BigDecimal tarifaDiaria;
    @Column(name = "monto_calculado", nullable = false)
    private BigDecimal montoCalculado;
    @Enumerated(EnumType.STRING)
    @Column(name = "estado_pago", nullable = false)
    private EstadoPago estadoPago;
    @Column(name = "fecha_generacion", nullable = false)
    private Instant fechaGeneracion;
    @Column(name = "fecha_resolucion")
    private Instant fechaResolucion;
    /** Bloqueo optimista: si dos personas cobran o cancelan la misma multa a la vez, la segunda recibe 409. */
    @Version
    private Long version;

    /** El id lo asigna la aplicación (M-0001); este indicador hace que JPA inserte en lugar de fusionar. */
    @Transient
    private boolean nueva = true;

    @PostLoad
    @PostPersist
    void marcarExistente() { this.nueva = false; }

    @Override
    public String getId() { return idMulta; }

    @Override
    public boolean isNew() { return nueva; }

    protected Multa() { }

    public Multa(String idMulta, Prestamo p, CalculadoraMulta.Resultado r, Instant ahora) {
        this.idMulta = idMulta;
        this.idPrestamo = p.getIdPrestamo();
        this.idUsuario = p.getIdUsuario();
        this.diasRetraso = r.diasRetraso();
        this.tarifaDiaria = r.tarifaDiaria();
        this.montoCalculado = r.monto();
        this.estadoPago = EstadoPago.PENDIENTE;
        this.fechaGeneracion = ahora;
    }

    /** Solo una multa PENDIENTE puede pagarse o cancelarse. */
    public void resolver(EstadoPago nuevo, Instant ahora) {
        if (nuevo == EstadoPago.PENDIENTE) {
            throw ApiException.invalido("Indica PAGADA o CANCELADA.");
        }
        if (estadoPago != EstadoPago.PENDIENTE) {
            throw ApiException.conflicto("MULTA_RESUELTA", "La multa ya está " + estadoPago + ".");
        }
        this.estadoPago = nuevo;
        this.fechaResolucion = ahora;
    }

    public String getIdMulta() { return idMulta; }
    public String getIdPrestamo() { return idPrestamo; }
    public String getIdUsuario() { return idUsuario; }
    public int getDiasRetraso() { return diasRetraso; }
    public BigDecimal getTarifaDiaria() { return tarifaDiaria; }
    public BigDecimal getMontoCalculado() { return montoCalculado; }
    public EstadoPago getEstadoPago() { return estadoPago; }
    public Instant getFechaGeneracion() { return fechaGeneracion; }
    public Instant getFechaResolucion() { return fechaResolucion; }
}
