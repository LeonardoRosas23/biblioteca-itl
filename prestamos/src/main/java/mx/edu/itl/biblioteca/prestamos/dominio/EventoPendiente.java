package mx.edu.itl.biblioteca.prestamos.dominio;

import jakarta.persistence.*;
import java.time.Duration;
import java.time.Instant;

/** Registro de la bandeja de salida (D6). Se guarda en la misma transacción que el cambio de negocio. */
@Entity
@Table(name = "evento_pendiente")
public class EventoPendiente {

    public enum Tipo { NOTIFICACION, CATALOGO_LIBERAR, CATALOGO_ENTREGA, CATALOGO_DEVOLUCION }
    public enum Estado { PENDIENTE, ENVIADO, FALLIDO }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id_evento")
    private Long idEvento;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Tipo tipo;
    @Column(nullable = false, columnDefinition = "TEXT")
    private String payload;
    @Column(name = "clave_idempotencia", nullable = false, unique = true)
    private String claveIdempotencia;
    @Column(name = "id_prestamo")
    private String idPrestamo;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Estado estado;
    @Column(nullable = false)
    private int intentos;
    @Column(name = "proximo_intento", nullable = false)
    private Instant proximoIntento;
    @Column(name = "ultimo_error")
    private String ultimoError;
    @Column(name = "fecha_creacion", nullable = false)
    private Instant fechaCreacion;
    @Column(name = "fecha_envio")
    private Instant fechaEnvio;

    protected EventoPendiente() { }

    public EventoPendiente(Tipo tipo, String payload, String clave, Instant ahora) {
        this(tipo, payload, clave, null, ahora);
    }

    public EventoPendiente(Tipo tipo, String payload, String clave, String idPrestamo, Instant ahora) {
        this.idPrestamo = idPrestamo;
        this.tipo = tipo;
        this.payload = payload;
        this.claveIdempotencia = clave;
        this.estado = Estado.PENDIENTE;
        this.proximoIntento = ahora;
        this.fechaCreacion = ahora;
    }

    public void marcarEnviado(Instant ahora) {
        this.estado = Estado.ENVIADO;
        this.fechaEnvio = ahora;
        this.ultimoError = null;
    }

    /** Deja el evento para más tarde sin contarlo como intento (espera a otro evento anterior). */
    public void posponer(Instant hasta) {
        this.proximoIntento = hasta;
    }

    /** Retroceso exponencial: 30 s, 1 min, 2 min, 4 min… hasta agotar intentos. */
    public void registrarFallo(String error, Instant ahora, int maxIntentos) {
        this.intentos++;
        this.ultimoError = error == null ? null : error.substring(0, Math.min(300, error.length()));
        if (intentos >= maxIntentos) {
            this.estado = Estado.FALLIDO;
        } else {
            long segundos = 30L * (1L << Math.min(intentos - 1, 10));
            this.proximoIntento = ahora.plus(Duration.ofSeconds(segundos));
        }
    }

    public Long getIdEvento() { return idEvento; }
    public Tipo getTipo() { return tipo; }
    public String getPayload() { return payload; }
    public String getClaveIdempotencia() { return claveIdempotencia; }
    public String getIdPrestamo() { return idPrestamo; }

    /** Los cambios de Catálogo de un mismo préstamo deben aplicarse en orden (entrega antes que devolución). */
    public boolean esDeCatalogo() {
        return tipo != Tipo.NOTIFICACION;
    }
    public Estado getEstado() { return estado; }
    public int getIntentos() { return intentos; }
    public Instant getProximoIntento() { return proximoIntento; }
    public String getUltimoError() { return ultimoError; }
}
