package mx.edu.itl.biblioteca.prestamos.web;

import java.util.LinkedHashMap;
import java.util.Map;
import mx.edu.itl.biblioteca.prestamos.comun.ApiException;
import mx.edu.itl.biblioteca.prestamos.comun.Correlacion;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/** Traduce cualquier error al formato común { codigo, mensaje, correlacionId } (sección 5.4). */
@RestControllerAdvice
public class ManejadorErrores {

    private static final Logger log = LoggerFactory.getLogger(ManejadorErrores.class);

    static ResponseEntity<Map<String, Object>> cuerpo(int status, String codigo, String mensaje) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("codigo", codigo);
        m.put("mensaje", mensaje);
        m.put("correlacionId", Correlacion.actual());
        return ResponseEntity.status(status).body(m);
    }

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, Object>> api(ApiException e) {
        return cuerpo(e.getStatus(), e.getCodigo(), e.getMessage());
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
    public ResponseEntity<Map<String, Object>> malFormado(Exception e) {
        return cuerpo(400, "DATOS_INVALIDOS", "La petición tiene un formato o valor no válido.");
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> validacion(MethodArgumentNotValidException e) {
        String campos = e.getBindingResult().getFieldErrors().stream()
                .map(f -> f.getField() + " " + f.getDefaultMessage()).reduce((a, b) -> a + "; " + b).orElse("");
        return cuerpo(400, "DATOS_INVALIDOS", "Revisa los campos: " + campos + ".");
    }

    @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
    public ResponseEntity<Map<String, Object>> concurrencia(Exception e) {
        return cuerpo(409, "MODIFICACION_CONCURRENTE", "El registro cambió mientras lo procesabas; actualiza la página y vuelve a intentarlo.");
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Map<String, Object>> sinRuta(NoResourceFoundException e) {
        return cuerpo(404, "RUTA_NO_ENCONTRADA", "La ruta solicitada no existe.");
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> inesperado(Exception e) {
        log.error("[{}] Error no controlado", Correlacion.actual(), e);
        return cuerpo(500, "ERROR_INTERNO", "Ocurrió un error inesperado.");
    }
}
