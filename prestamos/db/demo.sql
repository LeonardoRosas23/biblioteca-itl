-- Datos de demostración de Préstamos: un préstamo en cada estado y una multa pendiente.
-- Usuarios de la semilla: U102 Ana (ALUMNO), U103 Beto (ALUMNO), U104 Carla (PROFESOR).
-- Las fechas son relativas al día en que se cargan, en la zona horaria de la biblioteca.
--   P-0001 Ana   · Pendiente de recoger (reserva vigente)
--   P-0002 Ana   · Activo, vence mañana (recibe el recordatorio de CU09)
--   P-0003 Beto  · Vencido hace 3 días (Beto no puede pedir más: PI10)
--   P-0004 Beto  · Devuelto con 3 días de retraso → multa M-0001 de $30.00 pendiente
--   P-0005 Carla · Devuelto a tiempo
--   P-0006 Carla · Rechazado: la reserva expiró
--   P-0007 Carla · Activo, vence en 5 días (se puede renovar: PI15)
INSERT INTO prestamo (id_prestamo, id_usuario, id_recurso, titulo_recurso, categoria_recurso, estado, motivo,
                      fecha_solicitud, reserva_vigente_hasta, fecha_entrega, fecha_devolucion_estimada,
                      fecha_devolucion_real, renovaciones, recurso_danado, version)
SELECT v.id, v.usuario, v.recurso, v.titulo, v.categoria, v.estado, v.motivo,
       now() + v.solicitud, now() + v.solicitud + interval '72 hours', now() + v.entrega,
       (now() AT TIME ZONE 'America/Mexico_City')::date + v.limite,
       now() + v.devuelto, 0, false, 0
FROM (VALUES
    ('P-0001', 'U102', 'R005', 'Estructuras de datos en Java', 'LIBRO',  'PENDIENTE_ENTREGA', NULL,
        interval '-1 day',   NULL::interval,      6,  NULL::interval),
    ('P-0002', 'U102', 'R002', 'Laptop Lenovo ThinkPad',       'EQUIPO', 'ACTIVO',            NULL,
        interval '-3 days',  interval '-2 days',  1,  NULL::interval),
    ('P-0003', 'U103', 'R003', 'Proyector Epson',              'EQUIPO', 'VENCIDO',           NULL,
        interval '-7 days',  interval '-6 days',  -3, NULL::interval),
    ('P-0004', 'U103', 'R001', 'Cálculo diferencial',          'LIBRO',  'FINALIZADO',        NULL,
        interval '-16 days', interval '-15 days', -8, interval '-5 days'),
    ('P-0005', 'U104', 'R006', 'Ingeniería de software',       'LIBRO',  'FINALIZADO',        NULL,
        interval '-11 days', interval '-10 days', -3, interval '-4 days'),
    ('P-0006', 'U104', 'R004', 'Microscopio óptico',           'LABORATORIO', 'RECHAZADO', 'RESERVA_EXPIRADA',
        interval '-8 days',  NULL::interval,      -1, NULL::interval),
    ('P-0007', 'U104', 'R008', 'Bases de datos',               'LIBRO',  'ACTIVO',            NULL,
        interval '-2 days',  interval '-2 days',  5,  NULL::interval)
) AS v(id, usuario, recurso, titulo, categoria, estado, motivo, solicitud, entrega, limite, devuelto)
ON CONFLICT (id_prestamo) DO NOTHING;

INSERT INTO multa (id_multa, id_prestamo, id_usuario, dias_retraso, tarifa_diaria, monto_calculado,
                   estado_pago, fecha_generacion)
VALUES ('M-0001', 'P-0004', 'U103', 3, 10.00, 30.00, 'PENDIENTE', now() - interval '5 days')
ON CONFLICT (id_multa) DO NOTHING;

-- Para que los folios nuevos no choquen con los de demostración
SELECT setval('multa_seq', GREATEST((SELECT max(substr(id_multa, 3)::int) FROM multa), 1));
