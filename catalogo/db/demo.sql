-- Datos de demostración del Catálogo: reservas de los préstamos de prestamos/db/demo.sql.
-- Requiere la semilla (python -m scripts.seed) para que existan R001..R008.
-- Se puede correr varias veces: las reservas ya cargadas no vuelven a mover los contadores.
WITH nuevas AS (
    INSERT INTO reserva (id_prestamo, id_recurso, estado, fecha_creacion, fecha_actualizacion) VALUES
        ('P-0001', 'R005', 'RESERVADA', now() - interval '1 day',  now() - interval '1 day'),
        ('P-0002', 'R002', 'ENTREGADA', now() - interval '2 days', now() - interval '2 days'),
        ('P-0003', 'R003', 'ENTREGADA', now() - interval '6 days', now() - interval '6 days'),
        ('P-0004', 'R001', 'DEVUELTA',  now() - interval '15 days', now() - interval '5 days'),
        ('P-0005', 'R006', 'DEVUELTA',  now() - interval '10 days', now() - interval '4 days'),
        ('P-0006', 'R004', 'LIBERADA',  now() - interval '8 days', now() - interval '5 days'),
        ('P-0007', 'R008', 'ENTREGADA', now() - interval '2 days', now() - interval '2 days')
    ON CONFLICT (id_prestamo) DO NOTHING
    RETURNING id_recurso, estado
), cambios AS (
    SELECT id_recurso,
           count(*) FILTER (WHERE estado = 'RESERVADA') AS reservados,
           count(*) FILTER (WHERE estado = 'ENTREGADA') AS prestados
    FROM nuevas GROUP BY id_recurso
)
UPDATE recurso r
SET disponibles = r.disponibles - c.reservados - c.prestados,
    reservados  = r.reservados + c.reservados,
    prestados   = r.prestados + c.prestados,
    fecha_actualizacion = now()
FROM cambios c
WHERE r.id_recurso = c.id_recurso;
