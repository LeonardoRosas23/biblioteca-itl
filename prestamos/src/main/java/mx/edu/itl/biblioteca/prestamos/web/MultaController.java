package mx.edu.itl.biblioteca.prestamos.web;

import mx.edu.itl.biblioteca.prestamos.comun.Sesion;
import mx.edu.itl.biblioteca.prestamos.dominio.EstadoPago;
import mx.edu.itl.biblioteca.prestamos.servicio.MultaService;
import mx.edu.itl.biblioteca.prestamos.web.Dtos.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/multas")
public class MultaController {

    private final MultaService multas;

    public MultaController(MultaService multas) {
        this.multas = multas;
    }

    @GetMapping
    public Pagina<MultaDto> listar(@RequestAttribute(Sesion.ATRIBUTO) Sesion s,
                                   @RequestParam(required = false) String idUsuario,
                                   @RequestParam(required = false) EstadoPago estadoPago,
                                   @RequestParam(defaultValue = "1") int pagina,
                                   @RequestParam(defaultValue = "20") int tamano) {
        return Pagina.de(multas.listar(s, idUsuario, estadoPago, pagina, tamano), MultaDto::de);
    }

    @PatchMapping("/{id}/estado")
    public MultaDto resolver(@RequestAttribute(Sesion.ATRIBUTO) Sesion s, @PathVariable String id,
                             @RequestBody CambioMulta body) {
        return MultaDto.de(multas.resolver(s, id, body.estadoPago()));
    }
}
