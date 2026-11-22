package mx.edu.itl.biblioteca.prestamos.servicio;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Actor "Planificador" (CU09) y tareas de mantenimiento del flujo. */
@Component
@ConditionalOnProperty(name = "tareas.habilitadas", havingValue = "true", matchIfMissing = true)
public class TareasProgramadas {

    private static final Logger log = LoggerFactory.getLogger(TareasProgramadas.class);

    private final PrestamoService prestamos;
    private final EventoService eventos;

    public TareasProgramadas(PrestamoService prestamos, EventoService eventos) {
        this.prestamos = prestamos;
        this.eventos = eventos;
    }

    @Scheduled(cron = "${tareas.cron-vencimientos}", zone = "${negocio.zona-horaria}")
    public void vencimientos() {
        int[] r = prestamos.detectarVencimientos();
        log.info("CU09: {} recordatorios y {} préstamos marcados como vencidos", r[0], r[1]);
    }

    @Scheduled(fixedDelayString = "${tareas.expirar-reservas-ms}", initialDelay = 30_000)
    public void reservasExpiradas() {
        int n = prestamos.expirarReservas();
        if (n > 0) {
            log.info("RN04: {} reservas expiradas liberadas", n);
        }
    }

    @Scheduled(fixedDelayString = "${tareas.conciliar-ms:600000}", initialDelay = 60_000)
    public void conciliarReservas() {
        int n = prestamos.conciliarReservas();
        if (n > 0) {
            log.info("D5: {} reservas sin préstamo vigente enviadas a liberar", n);
        }
    }

    @Scheduled(fixedDelayString = "${tareas.eventos-ms}", initialDelay = 5_000)
    public void bandejaDeSalida() {
        eventos.procesarPendientes();
    }
}
