package mx.edu.itl.biblioteca.prestamos.servicio;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import mx.edu.itl.biblioteca.prestamos.comun.ApiException;
import mx.edu.itl.biblioteca.prestamos.comun.Sesion;
import mx.edu.itl.biblioteca.prestamos.dominio.EstadoPago;
import mx.edu.itl.biblioteca.prestamos.dominio.Multa;
import mx.edu.itl.biblioteca.prestamos.repositorio.MultaRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MultaService {

    private final MultaRepository multas;
    private final Clock reloj;

    public MultaService(MultaRepository multas, Clock reloj) {
        this.multas = multas;
        this.reloj = reloj;
    }

    /** RN09: el usuario ve sus multas; el personal las de cualquiera. */
    @Transactional(readOnly = true)
    public Page<Multa> listar(Sesion s, String idUsuario, EstadoPago estado, int pagina, int tamano) {
        String filtro = idUsuario;
        if (!s.esStaff()) {
            if (idUsuario != null && !idUsuario.equals(s.idUsuario())) {
                throw ApiException.prohibido("ACCESO_DENEGADO", "Solo puedes consultar tus propias multas.");
            }
            filtro = s.idUsuario();
        }
        return multas.buscar(filtro, estado, PageRequest.of(Math.max(0, pagina - 1), Math.min(100, Math.max(1, tamano))));
    }

    @Transactional(readOnly = true)
    public List<Multa> dePrestamos(List<String> ids) {
        return ids.isEmpty() ? List.of() : multas.findByIdPrestamoIn(ids);
    }

    /** Registra el pago o la cancelación de una multa (solo personal). */
    @Transactional
    public Multa resolver(Sesion s, String idMulta, EstadoPago nuevo) {
        if (!s.esStaff()) {
            throw ApiException.prohibido("ACCESO_DENEGADO", "Solo el personal registra pagos de multas.");
        }
        if (nuevo == null) {
            throw ApiException.invalido("Indica estadoPago: PAGADA o CANCELADA.");
        }
        Multa m = multas.findById(idMulta)
                .orElseThrow(() -> ApiException.noEncontrado("MULTA_NO_ENCONTRADA", "La multa no existe."));
        m.resolver(nuevo, Instant.now(reloj));
        return multas.save(m);
    }
}
