package mx.edu.itl.biblioteca.prestamos.comun;

import java.util.UUID;

/** Guarda el X-Correlation-Id del hilo actual para propagarlo a las llamadas salientes (D8). */
public final class Correlacion {
    private static final ThreadLocal<String> ACTUAL = new ThreadLocal<>();

    private Correlacion() { }

    public static String actual() {
        String id = ACTUAL.get();
        return id != null ? id : UUID.randomUUID().toString().substring(0, 8);
    }

    public static void fijar(String id) { ACTUAL.set(id); }

    public static void limpiar() { ACTUAL.remove(); }
}
