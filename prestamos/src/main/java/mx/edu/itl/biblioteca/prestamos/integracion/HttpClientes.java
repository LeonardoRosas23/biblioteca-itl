package mx.edu.itl.biblioteca.prestamos.integracion;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CancellationException;
import java.util.function.Supplier;
import mx.edu.itl.biblioteca.prestamos.comun.Correlacion;
import mx.edu.itl.biblioteca.prestamos.integracion.Clientes.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * Implementación HTTP de los clientes (D7): tiempo límite configurable, pocos reintentos
 * solo ante fallas de red, y propagación de X-Correlation-Id (D8) y X-Service-Token.
 */
@Configuration
public class HttpClientes {

    private final ObjectMapper mapper;
    private final String serviceToken;
    private final int timeoutMs;
    private final int maxReintentos;

    public HttpClientes(ObjectMapper mapper,
                        @Value("${seguridad.service-token}") String serviceToken,
                        @Value("${servicios.timeout-ms}") int timeoutMs,
                        @Value("${servicios.max-reintentos}") int maxReintentos) {
        this.mapper = mapper;
        this.serviceToken = serviceToken;
        this.timeoutMs = timeoutMs;
        this.maxReintentos = maxReintentos;
    }

    private RestClient cliente(String baseUrl) {
        HttpClient http = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1) // Uvicorn (Catálogo) rechaza el "upgrade" a HTTP/2 que el JDK intenta por defecto
                .connectTimeout(Duration.ofMillis(timeoutMs)).build();
        JdkClientHttpRequestFactory f = new JdkClientHttpRequestFactory(http);
        f.setReadTimeout(Duration.ofMillis(timeoutMs));
        return RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(f)
                .defaultHeader("X-Service-Token", serviceToken)
                .requestInterceptor((req, body, exec) -> {
                    req.getHeaders().set("X-Correlation-Id", Correlacion.actual());
                    return exec.execute(req, body);
                })
                .build();
    }

    /** Ejecuta con reintentos ante fallas de red o 5xx; los 4xx se traducen a RemotoException. */
    <T> T llamar(String servicio, Supplier<T> op) {
        RuntimeException ultima = null;
        for (int intento = 0; intento <= maxReintentos; intento++) {
            try {
                return op.get();
            } catch (RestClientResponseException e) {
                if (e.getStatusCode().is4xxClientError()) {
                    throw traducir(e);
                }
                ultima = e;
            } catch (ResourceAccessException e) {
                ultima = e;
            } catch (RestClientException | CancellationException e) {
                // Spring 6.2.1 (JdkClientHttpRequest) lanza CancellationException cuando el servicio remoto
                // no contesta dentro del tiempo límite (p. ej. el contenedor está detenido): también es "no disponible".
                ultima = e;
            }
            dormir(100L * (intento + 1));
        }
        throw new ServicioNoDisponibleException(servicio, ultima);
    }

    private RemotoException traducir(RestClientResponseException e) {
        String codigo = "ERROR_REMOTO";
        String mensaje = e.getMessage();
        try {
            JsonNode n = mapper.readTree(e.getResponseBodyAsString());
            if (n.hasNonNull("codigo")) codigo = n.get("codigo").asText();
            if (n.hasNonNull("mensaje")) mensaje = n.get("mensaje").asText();
        } catch (Exception ignorada) {
            // cuerpo no JSON: se conserva el mensaje original
        }
        HttpStatusCode s = e.getStatusCode();
        return new RemotoException(s.value(), codigo, mensaje);
    }

    private static void dormir(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
        }
    }

    @Bean
    public UsuariosClient usuariosClient(@Value("${servicios.usuarios-url}") String url) {
        RestClient rc = cliente(url);
        return idUsuario -> llamar("Usuarios", () -> rc.get()
                .uri("/api/v1/usuarios/{id}/estado", idUsuario)
                .retrieve().body(EstadoCuenta.class));
    }

    @Bean
    public CatalogoClient catalogoClient(@Value("${servicios.catalogo-url}") String url) {
        RestClient rc = cliente(url);
        return new CatalogoClient() {
            @Override
            public RecursoInfo obtener(String idRecurso) {
                return llamar("Catálogo", () -> rc.get().uri("/api/v1/recursos/{id}", idRecurso)
                        .retrieve().body(RecursoInfo.class));
            }

            @Override
            public void reservar(String idRecurso, String idPrestamo) {
                llamar("Catálogo", () -> rc.post().uri("/api/v1/recursos/{id}/reservas", idRecurso)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(Map.of("idPrestamo", idPrestamo, "cantidad", 1))
                        .retrieve().toBodilessEntity());
            }

            @Override
            public void liberar(String idRecurso, String idPrestamo) {
                llamar("Catálogo", () -> rc.delete().uri("/api/v1/recursos/{id}/reservas/{p}", idRecurso, idPrestamo)
                        .retrieve().toBodilessEntity());
            }

            @Override
            public void entregar(String idRecurso, String idPrestamo) {
                llamar("Catálogo", () -> rc.post().uri("/api/v1/recursos/{id}/reservas/{p}/entrega", idRecurso, idPrestamo)
                        .retrieve().toBodilessEntity());
            }

            @Override
            public void devolver(String idRecurso, String idPrestamo, boolean danado) {
                llamar("Catálogo", () -> rc.post().uri("/api/v1/recursos/{id}/reservas/{p}/devolucion", idRecurso, idPrestamo)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(Map.of("danado", danado))
                        .retrieve().toBodilessEntity());
            }

            @Override
            public List<ReservaInfo> reservasSinRecoger() {
                List<ReservaInfo> lista = llamar("Catálogo", () -> rc.get().uri("/api/v1/reservas?estado=RESERVADA")
                        .retrieve().body(new ParameterizedTypeReference<List<ReservaInfo>>() { }));
                return lista == null ? List.of() : lista;
            }
        };
    }

    @Bean
    public NotificacionesClient notificacionesClient(@Value("${servicios.notificaciones-url}") String url) {
        RestClient rc = cliente(url);
        return (aviso, clave) -> llamar("Notificaciones", () -> rc.post().uri("/api/v1/notificaciones")
                .header("Idempotency-Key", clave)
                .contentType(MediaType.APPLICATION_JSON)
                .body(aviso)
                .retrieve().toBodilessEntity());
    }
}
