package mx.edu.itl.biblioteca.prestamos;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

/** Reloj de pruebas que se puede adelantar para simular retrasos y vencimientos. */
public class RelojAjustable extends Clock {

    private Instant ahora;

    public RelojAjustable(Instant inicio) { this.ahora = inicio; }

    public void fijar(Instant i) { this.ahora = i; }

    public void avanzar(Duration d) { this.ahora = ahora.plus(d); }

    @Override public ZoneId getZone() { return ZoneOffset.UTC; }

    @Override public Clock withZone(ZoneId zone) { return Clock.fixed(ahora, zone); }

    @Override public Instant instant() { return ahora; }
}
