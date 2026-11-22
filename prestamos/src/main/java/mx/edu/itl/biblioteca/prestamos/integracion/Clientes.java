package mx.edu.itl.biblioteca.prestamos.integracion;

import java.util.List;
import java.util.Map;

/** Contratos con los otros microservicios (puertos). Las implementaciones HTTP están en HttpClientes. */
public final class Clientes {

    private Clientes() { }

    public record EstadoCuenta(String idUsuario, String nombre, String rol, String estado) { }

    public record RecursoInfo(String idRecurso, String titulo, String categoria, int disponibles, String estado) { }

    /** Reserva de Catálogo que sigue sin recogerse (conciliación D5). */
    public record ReservaInfo(String idPrestamo, String idRecurso, String fechaCreacion) { }

    /** El servicio remoto no respondió (timeout, conexión rechazada o 5xx). */
    public static class ServicioNoDisponibleException extends RuntimeException {
        private final String servicio;
        public ServicioNoDisponibleException(String servicio, Throwable causa) {
            super(servicio + " no disponible: " + (causa == null ? "" : causa.getMessage()), causa);
            this.servicio = servicio;
        }
        public String getServicio() { return servicio; }
    }

    /** El servicio remoto respondió con un error 4xx en el formato común. */
    public static class RemotoException extends RuntimeException {
        private final int status;
        private final String codigo;
        public RemotoException(int status, String codigo, String mensaje) {
            super(mensaje);
            this.status = status;
            this.codigo = codigo;
        }
        public int getStatus() { return status; }
        public String getCodigo() { return codigo; }
    }

    public interface UsuariosClient {
        EstadoCuenta estadoCuenta(String idUsuario);
    }

    public interface CatalogoClient {
        RecursoInfo obtener(String idRecurso);
        void reservar(String idRecurso, String idPrestamo);
        void liberar(String idRecurso, String idPrestamo);
        void entregar(String idRecurso, String idPrestamo);
        void devolver(String idRecurso, String idPrestamo, boolean danado);
        /** D5: reservas RESERVADAS con más de 10 minutos (las recientes pueden estar a medio guardar). */
        List<ReservaInfo> reservasSinRecoger();
    }

    public interface NotificacionesClient {
        void crear(Map<String, Object> aviso, String claveIdempotencia);
    }
}
