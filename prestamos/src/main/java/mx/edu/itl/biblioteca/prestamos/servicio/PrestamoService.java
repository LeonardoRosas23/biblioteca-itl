package mx.edu.itl.biblioteca.prestamos.servicio;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import mx.edu.itl.biblioteca.prestamos.comun.ApiException;
import mx.edu.itl.biblioteca.prestamos.comun.Sesion;
import mx.edu.itl.biblioteca.prestamos.config.ParametrosNegocio;
import mx.edu.itl.biblioteca.prestamos.dominio.*;
import mx.edu.itl.biblioteca.prestamos.dominio.EventoPendiente.Tipo;
import mx.edu.itl.biblioteca.prestamos.integracion.Clientes.*;
import mx.edu.itl.biblioteca.prestamos.repositorio.CupoUsuarioRepository;
import mx.edu.itl.biblioteca.prestamos.repositorio.MultaRepository;
import mx.edu.itl.biblioteca.prestamos.repositorio.PrestamoRepository;
import mx.edu.itl.biblioteca.prestamos.repositorio.SolicitudEsperaRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Orquestador del flujo de préstamo (D1). Las llamadas remotas se hacen fuera de las
 * transacciones locales; los efectos secundarios posteriores se registran en la bandeja
 * de salida dentro de la misma transacción que el cambio de estado.
 */
@Service
public class PrestamoService {

    private static final Logger log = LoggerFactory.getLogger(PrestamoService.class);

    static final Set<EstadoPrestamo> OCUPAN_CUPO =
            EnumSet.of(EstadoPrestamo.PENDIENTE_ENTREGA, EstadoPrestamo.ACTIVO, EstadoPrestamo.VENCIDO);
    private static final DateTimeFormatter FECHA =
            DateTimeFormatter.ofPattern("d 'de' MMMM", Locale.forLanguageTag("es-MX"));

    private final PrestamoRepository prestamos;
    private final MultaRepository multas;
    private final SolicitudEsperaRepository esperas;
    private final CupoUsuarioRepository cupos;
    private final EventoService eventos;
    private final UsuariosClient usuarios;
    private final CatalogoClient catalogo;
    private final ParametrosNegocio p;
    private final Clock reloj;
    private final TransactionTemplate tx;

    public PrestamoService(PrestamoRepository prestamos, MultaRepository multas, SolicitudEsperaRepository esperas,
                           CupoUsuarioRepository cupos, EventoService eventos, UsuariosClient usuarios,
                           CatalogoClient catalogo, ParametrosNegocio parametros, Clock reloj, TransactionTemplate tx) {
        this.prestamos = prestamos;
        this.multas = multas;
        this.esperas = esperas;
        this.cupos = cupos;
        this.eventos = eventos;
        this.usuarios = usuarios;
        this.catalogo = catalogo;
        this.p = parametros;
        this.reloj = reloj;
        this.tx = tx;
    }

    public record ResultadoDevolucion(Prestamo prestamo, int diasRetraso, Multa multa) { }

    private Instant ahora() { return Instant.now(reloj); }

    private LocalDate hoy() { return LocalDate.now(reloj.withZone(p.zona())); }

    // =============================== CU01 ===============================
    public Prestamo solicitar(Sesion s, String idRecurso) {
        if (!s.esUsuarioFinal()) {
            throw ApiException.prohibido("ACCESO_DENEGADO", "Solo alumnos y profesores solicitan préstamos.");
        }
        if (idRecurso == null || idRecurso.isBlank()) {
            throw ApiException.invalido("idRecurso es obligatorio.");
        }
        String idUsuario = s.idUsuario();

        // Paso 4: identidad y estado actual de la cuenta (D2: un bloqueo aplica aunque el token siga vigente)
        EstadoCuenta cuenta = remoto(() -> usuarios.estadoCuenta(idUsuario), "USUARIO_NO_ENCONTRADO");
        if (!"ACTIVO".equals(cuenta.estado())) {
            throw ApiException.prohibido("CUENTA_BLOQUEADA", "Tu cuenta no está activa; no puedes solicitar préstamos.");
        }

        // Paso 5: reglas locales RN02 y RN03
        if (multas.existsByIdUsuarioAndEstadoPago(idUsuario, EstadoPago.PENDIENTE)) {
            throw ApiException.prohibido("MULTA_PENDIENTE",
                    "Tienes una multa pendiente. Consulta Mis préstamos para verla.");
        }
        // RN08: también cuenta como vencido un ACTIVO cuya fecha ya pasó aunque la tarea diaria aún no corra
        if (prestamos.existsByIdUsuarioAndEstado(idUsuario, EstadoPrestamo.VENCIDO)
                || prestamos.existsByIdUsuarioAndEstadoAndFechaDevolucionEstimadaBefore(idUsuario, EstadoPrestamo.ACTIVO, hoy())) {
            throw ApiException.prohibido("PRESTAMO_VENCIDO",
                    "Tienes un préstamo vencido. Devuélvelo antes de solicitar otro.");
        }
        validarCupo(idUsuario, idRecurso);

        // Paso 6: disponibilidad
        RecursoInfo recurso = remoto(() -> catalogo.obtener(idRecurso), "RECURSO_NO_ENCONTRADO");
        if (recurso.disponibles() <= 0 || !"DISPONIBLE".equals(recurso.estado())) {
            registrarDemanda(idRecurso, idUsuario);
            throw ApiException.conflicto("RECURSO_NO_DISPONIBLE", "El recurso ya no tiene existencias disponibles.");
        }

        // Paso 7: reserva atómica en Catálogo con el folio generado antes (D4)
        String idPrestamo = String.format("P-%04d", prestamos.siguienteFolio());
        try {
            remoto(() -> { catalogo.reservar(idRecurso, idPrestamo); return null; }, "RECURSO_NO_ENCONTRADO");
        } catch (ApiException e) {
            if (e.getStatus() == 409) {
                registrarDemanda(idRecurso, idUsuario);
                throw ApiException.conflicto("RECURSO_NO_DISPONIBLE", "El recurso ya no tiene existencias disponibles.");
            }
            if (e.getStatus() == 503) {
                // Catálogo pudo haber reservado antes de que se agotara el tiempo de espera:
                // se libera por si acaso (si no existe la reserva, Catálogo responde 404 y no pasa nada).
                compensar(idRecurso, idPrestamo);
            }
            throw e;
        }

        Instant ahora = ahora();
        Instant reservaHasta = ahora.plus(Duration.ofHours(p.horasReserva()));
        LocalDate tentativa = hoy().plusDays(p.diasPrestamo(recurso.categoria()));
        List<Long> porDespachar = new ArrayList<>();
        Prestamo guardado;
        try {
            guardado = tx.execute(st -> {
                // RN03 sin carreras: dos solicitudes simultáneas del mismo usuario se revisan una tras otra
                cupos.asegurar(idUsuario);
                cupos.bloquear(idUsuario);
                validarCupo(idUsuario, idRecurso);
                Prestamo nuevo = Prestamo.solicitar(idPrestamo, idUsuario, idRecurso, recurso.titulo(),
                        recurso.categoria(), ahora, reservaHasta, tentativa);
                prestamos.save(nuevo);
                esperas.findByIdRecursoAndIdUsuarioAndAtendidaFalse(idRecurso, idUsuario).forEach(SolicitudEspera::atender);
                LocalDate limiteRecoger = LocalDate.ofInstant(reservaHasta, p.zona());
                agregar(porDespachar, eventos.notificar(idUsuario, idPrestamo, "CONFIRMACION",
                        "Tu solicitud de \"" + recurso.titulo() + "\" fue registrada. Recógela antes del "
                                + FECHA.format(limiteRecoger) + ".", "CONFIRMACION:" + idPrestamo));
                return nuevo;
            });
        } catch (RuntimeException e) {
            // D5: compensación. Si no se pudo guardar, la reserva se libera (o queda en la bandeja si Catálogo falla).
            compensar(idRecurso, idPrestamo);
            throw e;
        }
        eventos.despacharAhora(porDespachar);
        return guardado;
    }

    /** RN03 y "un mismo recurso a la vez". Se revisa antes de reservar y otra vez con el candado puesto. */
    private void validarCupo(String idUsuario, String idRecurso) {
        long ocupados = prestamos.countByIdUsuarioAndEstadoIn(idUsuario, OCUPAN_CUPO);
        if (ocupados >= p.limitePrestamos()) {
            throw ApiException.conflicto("LIMITE_PRESTAMOS", "Alcanzaste el límite de " + p.limitePrestamos()
                    + " préstamos. Devuelve alguno para solicitar otro.");
        }
        if (prestamos.existsByIdUsuarioAndIdRecursoAndEstadoIn(idUsuario, idRecurso, OCUPAN_CUPO)) {
            throw ApiException.conflicto("PRESTAMO_DUPLICADO", "Ya tienes este recurso solicitado o prestado.");
        }
    }

    private void registrarDemanda(String idRecurso, String idUsuario) {
        tx.executeWithoutResult(st -> {
            if (!esperas.existsByIdRecursoAndIdUsuarioAndAtendidaFalse(idRecurso, idUsuario)) {
                esperas.save(new SolicitudEspera(idRecurso, idUsuario, ahora()));
            }
        });
    }

    private void compensar(String idRecurso, String idPrestamo) {
        try {
            catalogo.liberar(idRecurso, idPrestamo);
        } catch (RemotoException ex) {
            if (ex.getStatus() != 404) {   // 404: no había reserva que liberar
                tx.executeWithoutResult(st -> eventos.catalogo(Tipo.CATALOGO_LIBERAR, idRecurso, idPrestamo, false));
            }
        } catch (RuntimeException ex) {
            tx.executeWithoutResult(st -> eventos.catalogo(Tipo.CATALOGO_LIBERAR, idRecurso, idPrestamo, false));
        }
    }

    // =============================== D5 · conciliación ===============================

    /**
     * Libera en Catálogo las reservas que no tienen un préstamo vigente: las de solicitudes que nunca
     * se guardaron o que ya se rechazaron. Catálogo solo devuelve reservas con más de 10 minutos,
     * así que no toca solicitudes que se están guardando en este momento. Devuelve cuántas liberó.
     */
    public int conciliarReservas() {
        final List<ReservaInfo> reservas;
        try {
            reservas = catalogo.reservasSinRecoger();
        } catch (RuntimeException e) {
            log.warn("D5: no se pudo consultar Catálogo para conciliar reservas: {}", e.getMessage());
            return 0;
        }
        List<Long> porDespachar = new ArrayList<>();
        Integer n = tx.execute(st -> {
            int huerfanas = 0;
            for (ReservaInfo r : reservas) {
                Optional<Prestamo> pr = prestamos.findById(r.idPrestamo());
                if (pr.isEmpty() || pr.get().getEstado() == EstadoPrestamo.RECHAZADO) {
                    huerfanas++;
                    agregar(porDespachar, eventos.catalogo(Tipo.CATALOGO_LIBERAR, r.idRecurso(), r.idPrestamo(), false));
                } else if (pr.get().getEstado() != EstadoPrestamo.PENDIENTE_ENTREGA) {
                    log.warn("D5: la reserva de {} sigue RESERVADA en Catálogo pero el préstamo está {}",
                            r.idPrestamo(), pr.get().getEstado());
                }
            }
            return huerfanas;
        });
        eventos.despacharAhora(porDespachar);
        return n == null ? 0 : n;
    }

    // =============================== CU04 ===============================
    public Prestamo aprobarEntrega(Sesion s, String idPrestamo) {
        exigirStaff(s);
        List<Long> porDespachar = new ArrayList<>();
        boolean[] expirada = {false};
        Prestamo resultado = tx.execute(st -> {
            Prestamo pr = buscar(idPrestamo);
            if (pr.reservaExpirada(ahora())) {
                // CU04-A1: se rechaza, se libera el recurso y se informa al usuario
                rechazarPorExpiracion(pr, porDespachar);
                expirada[0] = true;
                return pr;
            }
            LocalDate limite = hoy().plusDays(p.diasPrestamo(pr.getCategoriaRecurso()));
            pr.aprobarEntrega(ahora(), limite);
            prestamos.save(pr);
            agregar(porDespachar, eventos.catalogo(Tipo.CATALOGO_ENTREGA, pr.getIdRecurso(), idPrestamo, false));
            agregar(porDespachar, eventos.notificar(pr.getIdUsuario(), idPrestamo, "CONFIRMACION",
                    "Recogiste \"" + pr.getTituloRecurso() + "\". Devuélvelo a más tardar el "
                            + FECHA.format(limite) + ".", "ENTREGA:" + idPrestamo));
            return pr;
        });
        eventos.despacharAhora(porDespachar);
        if (expirada[0]) {
            throw ApiException.conflicto("RESERVA_EXPIRADA", "La reserva expiró; el préstamo se rechazó y el recurso se liberó.");
        }
        return resultado;
    }

    private void rechazarPorExpiracion(Prestamo pr, List<Long> porDespachar) {
        pr.rechazar("RESERVA_EXPIRADA");
        prestamos.save(pr);
        agregar(porDespachar, eventos.catalogo(Tipo.CATALOGO_LIBERAR, pr.getIdRecurso(), pr.getIdPrestamo(), false));
        agregar(porDespachar, eventos.notificar(pr.getIdUsuario(), pr.getIdPrestamo(), "CONFIRMACION",
                "Tu reserva de \"" + pr.getTituloRecurso() + "\" expiró porque no se recogió a tiempo.",
                "EXPIRADA:" + pr.getIdPrestamo()));
    }

    // =============================== CU05 ===============================
    public ResultadoDevolucion registrarDevolucion(Sesion s, String idPrestamo, boolean danado) {
        exigirStaff(s);
        List<Long> porDespachar = new ArrayList<>();
        ResultadoDevolucion r = tx.execute(st -> {
            Prestamo pr = buscar(idPrestamo);
            LocalDate limite = pr.getFechaDevolucionEstimada();
            pr.registrarDevolucion(ahora(), danado);
            prestamos.save(pr);
            LocalDate fechaReal = hoy();
            int dias = CalculadoraMulta.diasRetraso(limite, fechaReal);
            Optional<CalculadoraMulta.Resultado> calculo = CalculadoraMulta.calcular(limite, fechaReal, p);
            Multa multa = null;
            if (calculo.isPresent()) {
                multa = multas.save(new Multa(String.format("M-%04d", multas.siguienteFolio()), pr, calculo.get(), ahora()));
                agregar(porDespachar, eventos.notificar(pr.getIdUsuario(), idPrestamo, "ALERTA_MULTA",
                        "Se generó una multa de $" + multa.getMontoCalculado() + " por devolver \""
                                + pr.getTituloRecurso() + "\" con " + dias + " día(s) de retraso.",
                        "MULTA:" + multa.getIdMulta()));
            } else {
                agregar(porDespachar, eventos.notificar(pr.getIdUsuario(), idPrestamo, "CONFIRMACION",
                        "Registramos la devolución de \"" + pr.getTituloRecurso() + "\". ¡Gracias!",
                        "DEVOLUCION:" + idPrestamo));
            }
            agregar(porDespachar, eventos.catalogo(Tipo.CATALOGO_DEVOLUCION, pr.getIdRecurso(), idPrestamo, danado));
            return new ResultadoDevolucion(pr, dias, multa);
        });
        eventos.despacharAhora(porDespachar);
        return r;
    }

    // =============================== CU06 ===============================
    public Prestamo renovar(Sesion s, String idPrestamo) {
        List<Long> porDespachar = new ArrayList<>();
        Prestamo r = tx.execute(st -> {
            Prestamo pr = buscar(idPrestamo);
            if (!pr.getIdUsuario().equals(s.idUsuario())) {
                throw ApiException.prohibido("ACCESO_DENEGADO", "Solo puedes renovar tus propios préstamos.");
            }
            // Orden de la figura 6.4: estado/vencido → multa → solicitudes en espera → máximo de renovaciones
            if (pr.getEstado() == EstadoPrestamo.VENCIDO || hoy().isAfter(pr.getFechaDevolucionEstimada())) {
                throw ApiException.conflicto("PRESTAMO_VENCIDO", "El préstamo está vencido; devuélvelo en la biblioteca.");
            }
            if (pr.getEstado() != EstadoPrestamo.ACTIVO) {
                throw ApiException.conflicto("PRESTAMO_NO_ACTIVO", "Solo se renuevan préstamos activos.");
            }
            if (multas.existsByIdUsuarioAndEstadoPago(pr.getIdUsuario(), EstadoPago.PENDIENTE)) {
                throw ApiException.conflicto("MULTA_PENDIENTE", "Tienes una multa pendiente; no puedes renovar.");
            }
            Instant desde = maximo(pr.getFechaEntrega(), ahora().minus(Duration.ofDays(p.diasEspera())));
            if (esperas.existsByIdRecursoAndAtendidaFalseAndIdUsuarioNotAndFechaRegistroAfter(
                    pr.getIdRecurso(), pr.getIdUsuario(), desde)) {
                throw ApiException.conflicto("RESERVA_PENDIENTE",
                        "Otros usuarios están esperando este recurso; devuélvelo en la fecha actual.");
            }
            LocalDate nueva = pr.getFechaDevolucionEstimada().plusDays(p.diasPrestamo(pr.getCategoriaRecurso()));
            pr.renovar(nueva, p.maxRenovaciones(), hoy());
            prestamos.save(pr);
            agregar(porDespachar, eventos.notificar(pr.getIdUsuario(), idPrestamo, "CONFIRMACION",
                    "Renovaste \"" + pr.getTituloRecurso() + "\". Nueva fecha límite: " + FECHA.format(nueva) + ".",
                    "RENOVACION:" + idPrestamo + ":" + pr.getRenovaciones()));
            return pr;
        });
        eventos.despacharAhora(porDespachar);
        return r;
    }

    // =============================== CU07 ===============================
    public Prestamo detalle(Sesion s, String idPrestamo) {
        Prestamo pr = buscar(idPrestamo);
        if (!s.esStaff() && !pr.getIdUsuario().equals(s.idUsuario())) {
            throw ApiException.prohibido("ACCESO_DENEGADO", "Solo puedes consultar tus propios préstamos.");
        }
        return pr;
    }

    /** RN09: un usuario solo ve lo suyo; el personal puede filtrar por cualquier usuario. */
    public Page<Prestamo> listar(Sesion s, String idUsuario, EstadoPrestamo estado, String folio, int pagina, int tamano) {
        String filtroUsuario = idUsuario;
        if (!s.esStaff()) {
            if (idUsuario != null && !idUsuario.equals(s.idUsuario())) {
                throw ApiException.prohibido("ACCESO_DENEGADO", "Solo puedes consultar tus propios préstamos.");
            }
            filtroUsuario = s.idUsuario();
        }
        return prestamos.buscar(filtroUsuario, estado, blancoANulo(folio),
                PageRequest.of(Math.max(0, pagina - 1), Math.min(100, Math.max(1, tamano))));
    }

    // ====================== CU09 y RN04 (tareas programadas) ======================

    /** Envía recordatorios de vencimiento próximo y marca vencidos (CU09). Devuelve {recordatorios, vencidos}. */
    public int[] detectarVencimientos() {
        LocalDate hoy = hoy();
        List<Long> porDespachar = new ArrayList<>();
        int[] cuenta = tx.execute(st -> {
            int recordatorios = 0;
            for (Prestamo pr : prestamos.findByEstadoAndFechaDevolucionEstimadaBetween(
                    EstadoPrestamo.ACTIVO, hoy, hoy.plusDays(p.diasAviso()))) {
                EventoPendiente e = eventos.notificar(pr.getIdUsuario(), pr.getIdPrestamo(), "RECORDATORIO",
                        "\"" + pr.getTituloRecurso() + "\" vence el " + FECHA.format(pr.getFechaDevolucionEstimada()) + ".",
                        "RECORDATORIO:" + pr.getIdPrestamo() + ":" + pr.getFechaDevolucionEstimada());
                if (e != null) {
                    recordatorios++;
                    porDespachar.add(e.getIdEvento());
                }
            }
            int vencidos = 0;
            for (Prestamo pr : prestamos.findByEstadoAndFechaDevolucionEstimadaBefore(EstadoPrestamo.ACTIVO, hoy)) {
                if (pr.marcarVencidoSiCorresponde(hoy)) {
                    vencidos++;
                    prestamos.save(pr);
                    agregar(porDespachar, eventos.notificar(pr.getIdUsuario(), pr.getIdPrestamo(), "VENCIMIENTO",
                            "\"" + pr.getTituloRecurso() + "\" está vencido. Devuélvelo para evitar que la multa crezca.",
                            "VENCIMIENTO:" + pr.getIdPrestamo()));
                }
            }
            return new int[] {recordatorios, vencidos};
        });
        eventos.despacharAhora(porDespachar);
        return cuenta;
    }

    /** RN04: rechaza las solicitudes no recogidas a tiempo y libera el recurso. */
    public int expirarReservas() {
        List<Long> porDespachar = new ArrayList<>();
        Integer n = tx.execute(st -> {
            List<Prestamo> lista = prestamos.findByEstadoAndReservaVigenteHastaBefore(EstadoPrestamo.PENDIENTE_ENTREGA, ahora());
            lista.forEach(pr -> rechazarPorExpiracion(pr, porDespachar));
            return lista.size();
        });
        eventos.despacharAhora(porDespachar);
        return n == null ? 0 : n;
    }

    // =============================== utilidades ===============================

    private Prestamo buscar(String id) {
        return prestamos.findById(id)
                .orElseThrow(() -> ApiException.noEncontrado("PRESTAMO_NO_ENCONTRADO", "El préstamo no existe."));
    }

    private static void exigirStaff(Sesion s) {
        if (!s.esStaff()) {
            throw ApiException.prohibido("ACCESO_DENEGADO", "Solo el personal de biblioteca puede hacer esta acción.");
        }
    }

    private static void agregar(List<Long> lista, EventoPendiente e) {
        if (e != null) {
            lista.add(e.getIdEvento());
        }
    }

    private static Instant maximo(Instant a, Instant b) {
        if (a == null) return b;
        return a.isAfter(b) ? a : b;
    }

    private static String blancoANulo(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    /** Traduce fallas remotas: 404 → código propio, otros 4xx se propagan, red/5xx → 503 (CU01-A5). */
    private <T> T remoto(java.util.function.Supplier<T> op, String codigo404) {
        try {
            return op.get();
        } catch (ServicioNoDisponibleException e) {
            throw ApiException.noDisponible(e.getServicio());
        } catch (RemotoException e) {
            if (e.getStatus() == 404) {
                throw ApiException.noEncontrado(codigo404, e.getMessage());
            }
            throw new ApiException(e.getStatus(), e.getCodigo(), e.getMessage());
        }
    }
}
