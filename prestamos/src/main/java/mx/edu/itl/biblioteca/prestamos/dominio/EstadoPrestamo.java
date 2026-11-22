package mx.edu.itl.biblioteca.prestamos.dominio;

/** Estados del préstamo (figura 4.2). FINALIZADO y RECHAZADO son finales. */
public enum EstadoPrestamo {
    PENDIENTE_ENTREGA, ACTIVO, VENCIDO, FINALIZADO, RECHAZADO;

    /** Estados que cuentan contra el límite de préstamos (RN03). */
    public boolean ocupaCupo() {
        return this == PENDIENTE_ENTREGA || this == ACTIVO || this == VENCIDO;
    }
}
