package mx.edu.itl.biblioteca.prestamos.comun;

/** Identidad tomada del JWT (D3: el idUsuario nunca viene del cuerpo de la petición). */
public record Sesion(String idUsuario, String rol) {

    public static final String ATRIBUTO = "sesion";

    public boolean esStaff() {
        return "BIBLIOTECARIO".equals(rol) || "ADMIN".equals(rol);
    }

    public boolean esUsuarioFinal() {
        return "ALUMNO".equals(rol) || "PROFESOR".equals(rol);
    }
}
