package mx.edu.itl.biblioteca.prestamos.comun;

/** Error de negocio que se traduce al formato común { codigo, mensaje, correlacionId }. */
public class ApiException extends RuntimeException {
    private final int status;
    private final String codigo;

    public ApiException(int status, String codigo, String mensaje) {
        super(mensaje);
        this.status = status;
        this.codigo = codigo;
    }

    public int getStatus() { return status; }
    public String getCodigo() { return codigo; }

    public static ApiException invalido(String m) { return new ApiException(400, "DATOS_INVALIDOS", m); }
    public static ApiException noAutenticado() { return new ApiException(401, "NO_AUTENTICADO", "Se requiere un token válido."); }
    public static ApiException prohibido(String codigo, String m) { return new ApiException(403, codigo, m); }
    public static ApiException noEncontrado(String codigo, String m) { return new ApiException(404, codigo, m); }
    public static ApiException conflicto(String codigo, String m) { return new ApiException(409, codigo, m); }
    public static ApiException noDisponible(String servicio) {
        return new ApiException(503, "SERVICIO_NO_DISPONIBLE",
                "El servicio de " + servicio + " no respondió. Intenta de nuevo en unos momentos.");
    }
}
