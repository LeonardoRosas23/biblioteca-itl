package mx.edu.itl.biblioteca.prestamos.web;

import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import mx.edu.itl.biblioteca.prestamos.comun.Sesion;
import mx.edu.itl.biblioteca.prestamos.dominio.EstadoPrestamo;
import mx.edu.itl.biblioteca.prestamos.dominio.Multa;
import mx.edu.itl.biblioteca.prestamos.dominio.Prestamo;
import mx.edu.itl.biblioteca.prestamos.servicio.MultaService;
import mx.edu.itl.biblioteca.prestamos.servicio.PrestamoService;
import mx.edu.itl.biblioteca.prestamos.web.Dtos.*;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/prestamos")
public class PrestamoController {

    private final PrestamoService prestamos;
    private final MultaService multas;

    public PrestamoController(PrestamoService prestamos, MultaService multas) {
        this.prestamos = prestamos;
        this.multas = multas;
    }

    /** CU01 */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PrestamoDto solicitar(@RequestAttribute(Sesion.ATRIBUTO) Sesion s, @Valid @RequestBody SolicitudPrestamo body) {
        return PrestamoDto.de(prestamos.solicitar(s, body.idRecurso()), null);
    }

    /** CU07 */
    @GetMapping
    public Pagina<PrestamoDto> listar(@RequestAttribute(Sesion.ATRIBUTO) Sesion s,
                                      @RequestParam(required = false) String idUsuario,
                                      @RequestParam(required = false) EstadoPrestamo estado,
                                      @RequestParam(required = false) String folio,
                                      @RequestParam(defaultValue = "1") int pagina,
                                      @RequestParam(defaultValue = "20") int tamano) {
        Page<Prestamo> page = prestamos.listar(s, idUsuario, estado, folio, pagina, tamano);
        Map<String, Multa> porPrestamo = multas.dePrestamos(page.getContent().stream().map(Prestamo::getIdPrestamo).toList())
                .stream().collect(Collectors.toMap(Multa::getIdPrestamo, Function.identity(), (a, b) -> a));
        return Pagina.de(page, p -> PrestamoDto.de(p, porPrestamo.get(p.getIdPrestamo())));
    }

    @GetMapping("/{id}")
    public PrestamoDto detalle(@RequestAttribute(Sesion.ATRIBUTO) Sesion s, @PathVariable String id) {
        Prestamo p = prestamos.detalle(s, id);
        List<Multa> m = multas.dePrestamos(List.of(id));
        return PrestamoDto.de(p, m.isEmpty() ? null : m.get(0));
    }

    /** CU04 */
    @PatchMapping("/{id}/aprobar")
    public PrestamoDto aprobar(@RequestAttribute(Sesion.ATRIBUTO) Sesion s, @PathVariable String id) {
        return PrestamoDto.de(prestamos.aprobarEntrega(s, id), null);
    }

    /** CU05 */
    @PostMapping("/{id}/devolucion")
    public DevolucionDto devolver(@RequestAttribute(Sesion.ATRIBUTO) Sesion s, @PathVariable String id,
                                  @RequestBody(required = false) DevolucionRequest body) {
        boolean danado = body != null && body.esDanado();
        PrestamoService.ResultadoDevolucion r = prestamos.registrarDevolucion(s, id, danado);
        return new DevolucionDto(r.prestamo().getIdPrestamo(), r.prestamo().getEstado().name(),
                r.prestamo().getFechaDevolucionReal(), r.diasRetraso(), MultaDto.de(r.multa()));
    }

    /** CU06 */
    @PostMapping("/{id}/renovacion")
    public PrestamoDto renovar(@RequestAttribute(Sesion.ATRIBUTO) Sesion s, @PathVariable String id) {
        return PrestamoDto.de(prestamos.renovar(s, id), null);
    }
}
