package mx.edu.itl.biblioteca.prestamos.servicio;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import mx.edu.itl.biblioteca.prestamos.dominio.EventoPendiente;
import mx.edu.itl.biblioteca.prestamos.dominio.EventoPendiente.Tipo;
import mx.edu.itl.biblioteca.prestamos.integracion.Clientes.CatalogoClient;
import mx.edu.itl.biblioteca.prestamos.integracion.Clientes.NotificacionesClient;
import mx.edu.itl.biblioteca.prestamos.integracion.Clientes.RemotoException;
import mx.edu.itl.biblioteca.prestamos.repositorio.EventoRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Bandeja de salida (D6). Los avisos y los cambios en Catálogo se registran en la misma
 * transacción que el préstamo; después se intentan enviar y, si fallan, se reintentan
 * con retroceso exponencial. Una caída de Notificaciones nunca revierte un préstamo (RNF04).
 */
@Service
public class EventoService {

    private static final Logger log = LoggerFactory.getLogger(EventoService.class);

    private static final EnumSet<Tipo> TIPOS_CATALOGO =
            EnumSet.of(Tipo.CATALOGO_LIBERAR, Tipo.CATALOGO_ENTREGA, Tipo.CATALOGO_DEVOLUCION);
    private static final EnumSet<EventoPendiente.Estado> PENDIENTE = EnumSet.of(EventoPendiente.Estado.PENDIENTE);
    private static final EnumSet<EventoPendiente.Estado> FALLIDO = EnumSet.of(EventoPendiente.Estado.FALLIDO);

    private final EventoRepository repo;
    private final CatalogoClient catalogo;
    private final NotificacionesClient notificaciones;
    private final ObjectMapper mapper;
    private final Clock reloj;
    private final TransactionTemplate tx;
    private final int maxIntentos;

    public EventoService(EventoRepository repo, CatalogoClient catalogo, NotificacionesClient notificaciones,
                         ObjectMapper mapper, Clock reloj, TransactionTemplate tx,
                         @Value("${tareas.eventos-max-intentos:8}") int maxIntentos) {
        this.repo = repo;
        this.catalogo = catalogo;
        this.notificaciones = notificaciones;
        this.mapper = mapper;
        this.reloj = reloj;
        this.tx = tx;
        this.maxIntentos = maxIntentos;
    }

    // ------------- registro (dentro de la transacción del llamador) -------------

    /** Registra un evento; si la clave ya existe no hace nada (idempotencia, CU09-A3). */
    public EventoPendiente registrar(Tipo tipo, Map<String, Object> datos, String clave) {
        if (repo.existsByClaveIdempotencia(clave)) {
            return null;
        }
        try {
            Object idPrestamo = datos.get("idPrestamo");
            return repo.save(new EventoPendiente(tipo, mapper.writeValueAsString(datos), clave,
                    idPrestamo == null ? null : idPrestamo.toString(), Instant.now(reloj)));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("No se pudo serializar el evento", e);
        }
    }

    public EventoPendiente notificar(String idUsuario, String idPrestamo, String tipoAviso, String mensaje, String clave) {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("idUsuario", idUsuario);
        d.put("idPrestamo", idPrestamo);
        d.put("tipo", tipoAviso);
        d.put("mensaje", mensaje);
        return registrar(Tipo.NOTIFICACION, d, clave);
    }

    public EventoPendiente catalogo(Tipo tipo, String idRecurso, String idPrestamo, boolean danado) {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("idRecurso", idRecurso);
        d.put("idPrestamo", idPrestamo);
        d.put("danado", danado);
        return registrar(tipo, d, tipo.name() + ":" + idPrestamo);
    }

    // ------------- despacho -------------

    /** Intenta enviar ahora los eventos indicados (después del commit). Si fallan quedan para reintento. */
    public void despacharAhora(List<Long> ids) {
        for (Long id : ids) {
            if (id != null) {
                repo.findById(id).ifPresent(this::intentar);
            }
        }
    }

    /** Llamado por el planificador: procesa los eventos pendientes cuyo turno ya llegó. */
    public int procesarPendientes() {
        List<EventoPendiente> lote = repo.findByEstadoAndProximoIntentoLessThanEqualOrderByIdEventoAsc(
                EventoPendiente.Estado.PENDIENTE, Instant.now(reloj), PageRequest.of(0, 50));
        lote.forEach(this::intentar);
        return lote.size();
    }

    void intentar(EventoPendiente e) {
        if (e.getEstado() != EventoPendiente.Estado.PENDIENTE) {
            return;
        }
        // Orden por préstamo: un cambio de Catálogo no se manda mientras uno anterior del mismo
        // préstamo siga sin aplicarse (p. ej. la devolución espera a la entrega).
        if (hayAnterior(e, FALLIDO)) {
            registrarResultado(e, "Un cambio anterior de Catálogo para " + e.getIdPrestamo()
                    + " quedó FALLIDO; este se deja para revisión.", true);
            return;
        }
        if (hayAnterior(e, PENDIENTE)) {
            // No cuenta como intento: solo se pospone para no ocupar el lote del planificador.
            tx.executeWithoutResult(s -> repo.findById(e.getIdEvento()).ifPresent(actual -> {
                actual.posponer(Instant.now(reloj).plusSeconds(30));
                repo.save(actual);
            }));
            return;
        }
        String error = null;
        boolean descartar = false;
        try {
            enviar(e);
        } catch (RemotoException re) {
            if (re.getStatus() == 404 && e.getTipo() == Tipo.CATALOGO_LIBERAR) {
                // No hay reserva que liberar (p. ej. Catálogo nunca la llegó a crear): el objetivo ya se cumple.
                registrarResultado(e, null, false);
                return;
            }
            // 4xx: reintentar no lo arreglará (p. ej. reserva ya cerrada). Se marca como fallido para revisión.
            error = re.getStatus() + " " + re.getCodigo() + ": " + re.getMessage();
            descartar = true;
        } catch (RuntimeException ex) {
            error = ex.getMessage();
        }
        registrarResultado(e, error, descartar);
    }

    private boolean hayAnterior(EventoPendiente e, EnumSet<EventoPendiente.Estado> estados) {
        return e.esDeCatalogo() && e.getIdPrestamo() != null
                && repo.existsByIdPrestamoAndTipoInAndEstadoInAndIdEventoLessThan(
                        e.getIdPrestamo(), TIPOS_CATALOGO, estados, e.getIdEvento());
    }

    private void registrarResultado(EventoPendiente e, String err, boolean fin) {
        tx.executeWithoutResult(s -> {
            EventoPendiente actual = repo.findById(e.getIdEvento()).orElseThrow();
            Instant ahora = Instant.now(reloj);
            if (err == null) {
                actual.marcarEnviado(ahora);
            } else {
                actual.registrarFallo(err, ahora, fin ? 0 : maxIntentos);
                log.warn("Evento {} {} falló (intento {}): {}", actual.getIdEvento(), actual.getTipo(),
                        actual.getIntentos(), err);
            }
            repo.save(actual);
        });
    }

    @SuppressWarnings("unchecked")
    private void enviar(EventoPendiente e) {
        Map<String, Object> d;
        try {
            d = mapper.readValue(e.getPayload(), Map.class);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("payload inválido", ex);
        }
        String rec = (String) d.get("idRecurso");
        String pre = (String) d.get("idPrestamo");
        switch (e.getTipo()) {
            case NOTIFICACION -> notificaciones.crear(d, e.getClaveIdempotencia());
            case CATALOGO_LIBERAR -> catalogo.liberar(rec, pre);
            case CATALOGO_ENTREGA -> catalogo.entregar(rec, pre);
            case CATALOGO_DEVOLUCION -> catalogo.devolver(rec, pre, Boolean.TRUE.equals(d.get("danado")));
        }
    }
}
