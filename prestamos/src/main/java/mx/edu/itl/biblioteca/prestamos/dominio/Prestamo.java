package mx.edu.itl.biblioteca.prestamos.dominio;

import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import mx.edu.itl.biblioteca.prestamos.comun.ApiException;

/**
 * Entidad raíz del dominio. Las transiciones de estado viven aquí para que ninguna capa
 * pueda dejar un préstamo en un estado no dibujado en la figura 4.2 (cualquier otra → 409).
 */
@Entity
@Table(name = "prestamo")
public class Prestamo {

    @Id
    @Column(name = "id_prestamo")
    private String idPrestamo;
    @Column(name = "id_usuario", nullable = false)
    private String idUsuario;
    @Column(name = "id_recurso", nullable = false)
    private String idRecurso;
    @Column(name = "titulo_recurso", nullable = false)
    private String tituloRecurso;
    @Column(name = "categoria_recurso", nullable = false)
    private String categoriaRecurso;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private EstadoPrestamo estado;
    private String motivo;
    @Column(name = "fecha_solicitud", nullable = false)
    private Instant fechaSolicitud;
    @Column(name = "reserva_vigente_hasta", nullable = false)
    private Instant reservaVigenteHasta;
    @Column(name = "fecha_entrega")
    private Instant fechaEntrega;
    @Column(name = "fecha_devolucion_estimada", nullable = false)
    private LocalDate fechaDevolucionEstimada;
    @Column(name = "fecha_devolucion_real")
    private Instant fechaDevolucionReal;
    @Column(nullable = false)
    private int renovaciones;
    @Column(name = "recurso_danado", nullable = false)
    private boolean recursoDanado;
    @Version
    private Long version;   // null mientras es nuevo: Spring Data hace persist y no merge

    protected Prestamo() { }

    /** CU01: una solicitud aceptada nace PENDIENTE_ENTREGA con su reserva vigente. */
    public static Prestamo solicitar(String idPrestamo, String idUsuario, String idRecurso, String titulo,
                                     String categoria, Instant ahora, Instant reservaHasta, LocalDate fechaTentativa) {
        Prestamo p = new Prestamo();
        p.idPrestamo = idPrestamo;
        p.idUsuario = idUsuario;
        p.idRecurso = idRecurso;
        p.tituloRecurso = titulo;
        p.categoriaRecurso = categoria;
        p.estado = EstadoPrestamo.PENDIENTE_ENTREGA;
        p.fechaSolicitud = ahora;
        p.reservaVigenteHasta = reservaHasta;
        p.fechaDevolucionEstimada = fechaTentativa;
        return p;
    }

    public boolean reservaExpirada(Instant ahora) {
        return estado == EstadoPrestamo.PENDIENTE_ENTREGA && ahora.isAfter(reservaVigenteHasta);
    }

    /** CU04 / RN05: PENDIENTE_ENTREGA → ACTIVO con la fecha límite calculada al entregar. */
    public void aprobarEntrega(Instant ahora, LocalDate fechaLimite) {
        exigir(EstadoPrestamo.PENDIENTE_ENTREGA, "PRESTAMO_NO_PENDIENTE", "aprobar la entrega de");
        if (reservaExpirada(ahora)) {
            throw ApiException.conflicto("RESERVA_EXPIRADA", "La reserva expiró; el recurso se liberó.");
        }
        this.estado = EstadoPrestamo.ACTIVO;
        this.fechaEntrega = ahora;
        this.fechaDevolucionEstimada = fechaLimite;
    }

    /** RN04: PENDIENTE_ENTREGA → RECHAZADO (motivo obligatorio). */
    public void rechazar(String motivo) {
        exigir(EstadoPrestamo.PENDIENTE_ENTREGA, "PRESTAMO_NO_PENDIENTE", "rechazar");
        this.estado = EstadoPrestamo.RECHAZADO;
        this.motivo = motivo;
    }

    /** RN08: ACTIVO → VENCIDO cuando la fecha límite ya pasó. */
    public boolean marcarVencidoSiCorresponde(LocalDate hoy) {
        if (estado == EstadoPrestamo.ACTIVO && hoy.isAfter(fechaDevolucionEstimada)) {
            estado = EstadoPrestamo.VENCIDO;
            return true;
        }
        return false;
    }

    /** CU05: ACTIVO o VENCIDO → FINALIZADO. */
    public void registrarDevolucion(Instant ahora, boolean danado) {
        if (estado == EstadoPrestamo.FINALIZADO) {
            throw ApiException.conflicto("PRESTAMO_FINALIZADO", "El préstamo ya se había devuelto.");
        }
        if (estado != EstadoPrestamo.ACTIVO && estado != EstadoPrestamo.VENCIDO) {
            throw ApiException.conflicto("PRESTAMO_NO_ACTIVO",
                    "Solo se registra la devolución de un préstamo activo o vencido (estado actual: " + estado + ").");
        }
        this.estado = EstadoPrestamo.FINALIZADO;
        this.fechaDevolucionReal = ahora;
        this.recursoDanado = danado;
    }

    /** CU06 / RN06: extiende la fecha límite; las demás condiciones las verifica el servicio. */
    public void renovar(LocalDate nuevaFecha, int maxRenovaciones, LocalDate hoy) {
        if (estado == EstadoPrestamo.VENCIDO || (estado == EstadoPrestamo.ACTIVO && hoy.isAfter(fechaDevolucionEstimada))) {
            throw ApiException.conflicto("PRESTAMO_VENCIDO", "El préstamo está vencido; devuélvelo en la biblioteca.");
        }
        exigir(EstadoPrestamo.ACTIVO, "PRESTAMO_NO_ACTIVO", "renovar");
        if (renovaciones >= maxRenovaciones) {
            throw ApiException.conflicto("LIMITE_RENOVACIONES",
                    "Ya usaste las " + maxRenovaciones + " renovación(es) permitidas para este préstamo.");
        }
        this.fechaDevolucionEstimada = nuevaFecha;
        this.renovaciones++;
    }

    private void exigir(EstadoPrestamo esperado, String codigo, String accion) {
        if (estado != esperado) {
            throw ApiException.conflicto(codigo, "No se puede " + accion + " un préstamo en estado " + estado + ".");
        }
    }

    public String getIdPrestamo() { return idPrestamo; }
    public String getIdUsuario() { return idUsuario; }
    public String getIdRecurso() { return idRecurso; }
    public String getTituloRecurso() { return tituloRecurso; }
    public String getCategoriaRecurso() { return categoriaRecurso; }
    public EstadoPrestamo getEstado() { return estado; }
    public String getMotivo() { return motivo; }
    public Instant getFechaSolicitud() { return fechaSolicitud; }
    public Instant getReservaVigenteHasta() { return reservaVigenteHasta; }
    public Instant getFechaEntrega() { return fechaEntrega; }
    public LocalDate getFechaDevolucionEstimada() { return fechaDevolucionEstimada; }
    public Instant getFechaDevolucionReal() { return fechaDevolucionReal; }
    public int getRenovaciones() { return renovaciones; }
    public boolean isRecursoDanado() { return recursoDanado; }
}
