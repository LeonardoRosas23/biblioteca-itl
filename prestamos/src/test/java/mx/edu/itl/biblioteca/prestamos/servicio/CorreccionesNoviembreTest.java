package mx.edu.itl.biblioteca.prestamos.servicio;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import mx.edu.itl.biblioteca.prestamos.BasePrueba;
import mx.edu.itl.biblioteca.prestamos.comun.ApiException;
import mx.edu.itl.biblioteca.prestamos.dominio.*;
import mx.edu.itl.biblioteca.prestamos.integracion.Clientes.*;
import mx.edu.itl.biblioteca.prestamos.repositorio.EventoRepository;
import mx.edu.itl.biblioteca.prestamos.repositorio.MultaRepository;
import mx.edu.itl.biblioteca.prestamos.repositorio.PrestamoRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.orm.ObjectOptimisticLockingFailureException;

@DisplayName("Correcciones de noviembre · casos de falla entre servicios y concurrencia")
class CorreccionesNoviembreTest extends BasePrueba {

    @Autowired PrestamoService svc;
    @Autowired MultaService multaSvc;
    @Autowired EventoService eventoSvc;
    @Autowired PrestamoRepository prestamos;
    @Autowired MultaRepository multas;
    @Autowired EventoRepository eventos;

    private ApiException error(Runnable r) {
        try {
            r.run();
        } catch (ApiException e) {
            return e;
        }
        throw new AssertionError("Se esperaba ApiException");
    }

    private Prestamo activo(String recurso) {
        Prestamo p = svc.solicitar(alumno, recurso);
        return svc.aprobarEntrega(biblio, p.getIdPrestamo());
    }

    @Test
    @DisplayName("PI19: Catálogo no responde al reservar → 503 y se libera la reserva que pudo quedar")
    void catalogoCaidoAlReservar() {
        doThrow(new ServicioNoDisponibleException("Catálogo", null)).when(catalogo).reservar(eq("R001"), anyString());
        ApiException e = error(() -> svc.solicitar(alumno, "R001"));
        assertThat(e.getStatus()).isEqualTo(503);
        assertThat(prestamos.count()).isZero();
        verify(catalogo).liberar(eq("R001"), anyString());
    }

    @Test
    @DisplayName("PI19: si tampoco se puede liberar, la liberación queda en la bandeja para reintento")
    void catalogoCaidoAlReservarYAlLiberar() {
        doThrow(new ServicioNoDisponibleException("Catálogo", null)).when(catalogo).reservar(eq("R001"), anyString());
        doThrow(new ServicioNoDisponibleException("Catálogo", null)).when(catalogo).liberar(eq("R001"), anyString());
        error(() -> svc.solicitar(alumno, "R001"));
        assertThat(eventos.findAll()).singleElement().satisfies(ev -> {
            assertThat(ev.getTipo()).isEqualTo(EventoPendiente.Tipo.CATALOGO_LIBERAR);
            assertThat(ev.getEstado()).isEqualTo(EventoPendiente.Estado.PENDIENTE);
        });
    }

    @Test
    @DisplayName("Liberar una reserva que Catálogo no tiene (404) cuenta como hecho, no como falla")
    void liberarInexistenteEsExito() {
        doThrow(new ServicioNoDisponibleException("Catálogo", null)).when(catalogo).reservar(eq("R001"), anyString());
        doThrow(new ServicioNoDisponibleException("Catálogo", null)).when(catalogo).liberar(eq("R001"), anyString());
        error(() -> svc.solicitar(alumno, "R001"));

        doThrow(new RemotoException(404, "RESERVA_NO_ENCONTRADA", "no")).when(catalogo).liberar(eq("R001"), anyString());
        reloj.avanzar(Duration.ofMinutes(1));
        eventoSvc.procesarPendientes();
        assertThat(eventos.findAll().get(0).getEstado()).isEqualTo(EventoPendiente.Estado.ENVIADO);
    }

    @Test
    @DisplayName("RN08: un préstamo atrasado bloquea solicitudes aunque la tarea diaria aún no lo marque VENCIDO")
    void atrasadoAntesDeLaTareaDiaria() {
        activo("R001");
        reloj.avanzar(Duration.ofDays(8));   // la fecha límite ya pasó; no se corre detectarVencimientos()
        assertThat(error(() -> svc.solicitar(alumno, "R002")).getCodigo()).isEqualTo("PRESTAMO_VENCIDO");
    }

    @Test
    @DisplayName("Orden de eventos: la devolución espera a que Catálogo aplique la entrega")
    void devolucionEsperaALaEntrega() {
        Prestamo p = svc.solicitar(alumno, "R001");
        doThrow(new ServicioNoDisponibleException("Catálogo", null)).when(catalogo).entregar(anyString(), anyString());
        svc.aprobarEntrega(biblio, p.getIdPrestamo());
        svc.registrarDevolucion(biblio, p.getIdPrestamo(), false);
        verify(catalogo, never()).devolver(anyString(), anyString(), anyBoolean());

        // Catálogo vuelve: primero se aplica la entrega y después la devolución
        doNothing().when(catalogo).entregar(anyString(), anyString());
        reloj.avanzar(Duration.ofMinutes(2));
        eventoSvc.procesarPendientes();
        InOrder orden = inOrder(catalogo);
        orden.verify(catalogo).entregar("R001", p.getIdPrestamo());
        orden.verify(catalogo).devolver("R001", p.getIdPrestamo(), false);
        assertThat(eventos.findAll()).filteredOn(EventoPendiente::esDeCatalogo)
                .allMatch(ev -> ev.getEstado() == EventoPendiente.Estado.ENVIADO);
    }

    @Test
    @DisplayName("Orden de eventos: si la entrega quedó FALLIDA, la devolución también se deja para revisión")
    void devolucionTrasEntregaFallida() {
        Prestamo p = svc.solicitar(alumno, "R001");
        doThrow(new RemotoException(409, "TRANSICION_INVALIDA", "no")).when(catalogo).entregar(anyString(), anyString());
        svc.aprobarEntrega(biblio, p.getIdPrestamo());
        svc.registrarDevolucion(biblio, p.getIdPrestamo(), false);
        verify(catalogo, never()).devolver(anyString(), anyString(), anyBoolean());
        assertThat(eventos.findAll()).filteredOn(ev -> ev.getTipo() == EventoPendiente.Tipo.CATALOGO_DEVOLUCION)
                .singleElement().extracting(EventoPendiente::getEstado).isEqualTo(EventoPendiente.Estado.FALLIDO);
    }

    @Test
    @DisplayName("RN03: dos solicitudes simultáneas del mismo usuario no rebasan el límite")
    void solicitudesSimultaneasRespetanElLimite() throws Exception {
        svc.solicitar(alumno, "R001");
        svc.solicitar(alumno, "R002");   // queda 1 lugar (límite 3)

        // Las dos solicitudes pasan la revisión previa y se encuentran justo al reservar
        CyclicBarrier ambas = new CyclicBarrier(2);
        doAnswer(inv -> { ambas.await(5, TimeUnit.SECONDS); return null; })
                .when(catalogo).reservar(argThat(r -> r.equals("R003") || r.equals("R004")), anyString());

        ExecutorService pool = Executors.newFixedThreadPool(2);
        List<Future<String>> res = new ArrayList<>();
        for (String recurso : List.of("R003", "R004")) {
            res.add(pool.submit(() -> {
                try {
                    svc.solicitar(alumno, recurso);
                    return "OK";
                } catch (ApiException e) {
                    return e.getCodigo();
                }
            }));
        }
        List<String> codigos = new ArrayList<>();
        for (Future<String> f : res) {
            codigos.add(f.get(20, TimeUnit.SECONDS));
        }
        pool.shutdown();
        Collections.sort(codigos);

        assertThat(codigos).containsExactly("LIMITE_PRESTAMOS", "OK");
        assertThat(prestamos.countByIdUsuarioAndEstadoIn("U123", PrestamoService.OCUPAN_CUPO)).isEqualTo(3);
        verify(catalogo, times(1)).liberar(argThat(r -> r.equals("R003") || r.equals("R004")), anyString());
    }

    @Test
    @DisplayName("D5: la conciliación libera reservas sin préstamo o de préstamos rechazados, y respeta las vigentes")
    void conciliacion() {
        Prestamo vigente = svc.solicitar(alumno, "R001");
        Prestamo rechazado = svc.solicitar(alumno, "R002");
        jdbc.update("UPDATE prestamo SET estado = 'RECHAZADO', motivo = 'RESERVA_EXPIRADA' WHERE id_prestamo = ?",
                rechazado.getIdPrestamo());
        when(catalogo.reservasSinRecoger()).thenReturn(List.of(
                new ReservaInfo(vigente.getIdPrestamo(), "R001", "2026-10-09T10:00:00Z"),
                new ReservaInfo(rechazado.getIdPrestamo(), "R002", "2026-10-09T10:00:00Z"),
                new ReservaInfo("P-9999", "R009", "2026-10-09T10:00:00Z")));

        assertThat(svc.conciliarReservas()).isEqualTo(2);
        verify(catalogo).liberar("R009", "P-9999");
        verify(catalogo).liberar("R002", rechazado.getIdPrestamo());
        verify(catalogo, never()).liberar("R001", vigente.getIdPrestamo());

        // Repetirla no duplica eventos
        assertThat(svc.conciliarReservas()).isEqualTo(2);
        assertThat(eventos.findAll()).filteredOn(ev -> ev.getTipo() == EventoPendiente.Tipo.CATALOGO_LIBERAR).hasSize(2);
    }

    @Test
    @DisplayName("D5: si Catálogo no responde, la conciliación no falla")
    void conciliacionConCatalogoCaido() {
        when(catalogo.reservasSinRecoger()).thenThrow(new ServicioNoDisponibleException("Catálogo", null));
        assertThat(svc.conciliarReservas()).isZero();
    }

    @Test
    @DisplayName("Multa cobrada por dos personas a la vez: la segunda recibe conflicto de concurrencia")
    void multaConBloqueoOptimista() {
        Prestamo p = activo("R001");
        reloj.avanzar(Duration.ofDays(10));
        String id = svc.registrarDevolucion(biblio, p.getIdPrestamo(), false).multa().getIdMulta();

        Multa primera = multas.findById(id).orElseThrow();
        Multa segunda = multas.findById(id).orElseThrow();   // copia leída antes de que se guarde la primera
        primera.resolver(EstadoPago.PAGADA, reloj.instant());
        multas.save(primera);
        segunda.resolver(EstadoPago.CANCELADA, reloj.instant());
        assertThatThrownBy(() -> multas.save(segunda)).isInstanceOf(ObjectOptimisticLockingFailureException.class);
        assertThat(multas.findById(id).orElseThrow().getEstadoPago()).isEqualTo(EstadoPago.PAGADA);
    }
}
