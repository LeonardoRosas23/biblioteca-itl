package mx.edu.itl.biblioteca.prestamos.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import javax.crypto.SecretKey;
import mx.edu.itl.biblioteca.prestamos.comun.Correlacion;
import mx.edu.itl.biblioteca.prestamos.comun.Sesion;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * D8: asigna X-Correlation-Id. D2/D3: verifica localmente la firma del JWT emitido por Usuarios
 * y deja la identidad en el atributo "sesion"; el idUsuario jamás se toma del cuerpo.
 */
@Component
@Order(1)
public class FiltroSeguridad extends OncePerRequestFilter {

    private final SecretKey clave;
    private final ObjectMapper mapper;

    public FiltroSeguridad(@Value("${seguridad.jwt-secret}") String secreto, ObjectMapper mapper) {
        this.clave = Keys.hmacShaKeyFor(secreto.getBytes(StandardCharsets.UTF_8));
        this.mapper = mapper;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        String cid = req.getHeader("X-Correlation-Id");
        if (cid == null || cid.isBlank()) {
            cid = UUID.randomUUID().toString().substring(0, 8);
        }
        Correlacion.fijar(cid);
        res.setHeader("X-Correlation-Id", cid);
        try {
            if (req.getRequestURI().startsWith("/api/")) {
                String h = req.getHeader("Authorization");
                if (h == null || !h.startsWith("Bearer ")) {
                    error(res, cid, "NO_AUTENTICADO", "Se requiere un token válido.");
                    return;
                }
                try {
                    Claims c = Jwts.parser().verifyWith(clave).build().parseSignedClaims(h.substring(7)).getPayload();
                    req.setAttribute(Sesion.ATRIBUTO, new Sesion(c.getSubject(), c.get("rol", String.class)));
                } catch (JwtException | IllegalArgumentException e) {
                    error(res, cid, "NO_AUTENTICADO", "El token es inválido o expiró.");
                    return;
                }
            }
            chain.doFilter(req, res);
        } finally {
            Correlacion.limpiar();
        }
    }

    private void error(HttpServletResponse res, String cid, String codigo, String mensaje) throws IOException {
        res.setStatus(401);
        res.setContentType(MediaType.APPLICATION_JSON_VALUE);
        res.setCharacterEncoding("UTF-8");
        Map<String, Object> cuerpo = new LinkedHashMap<>();
        cuerpo.put("codigo", codigo);
        cuerpo.put("mensaje", mensaje);
        cuerpo.put("correlacionId", cid);
        mapper.writeValue(res.getOutputStream(), cuerpo);
    }
}
