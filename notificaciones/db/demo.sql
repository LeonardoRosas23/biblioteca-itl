-- Datos de demostración de Notificaciones: avisos ya enviados de los préstamos de prestamos/db/demo.sql.
-- Las claves de idempotencia son las mismas que usa Préstamos, así que no se duplican.
INSERT INTO notificacion (id_notificacion, id_usuario, id_prestamo, tipo, mensaje, canal, estado, leida,
                          clave_idempotencia, intentos, fecha_creacion, fecha_envio)
VALUES
    ('N-0001', 'U102', 'P-0001', 'CONFIRMACION', 'Tu solicitud de "Estructuras de datos en Java" fue registrada. Recógela en los próximos 2 días.',
        'APP', 'ENVIADA', false, 'CONFIRMACION:P-0001', 0, now() - interval '1 day', now() - interval '1 day'),
    ('N-0002', 'U102', 'P-0002', 'CONFIRMACION', 'Recogiste "Laptop Lenovo ThinkPad". Devuélvela a más tardar mañana.',
        'APP', 'ENVIADA', true, 'ENTREGA:P-0002', 0, now() - interval '2 days', now() - interval '2 days'),
    ('N-0003', 'U103', 'P-0003', 'VENCIMIENTO', '"Proyector Epson" está vencido. Devuélvelo para evitar que la multa crezca.',
        'APP', 'ENVIADA', false, 'VENCIMIENTO:P-0003', 0, now() - interval '2 days', now() - interval '2 days'),
    ('N-0004', 'U103', 'P-0004', 'ALERTA_MULTA', 'Se generó una multa de $30.00 por devolver "Cálculo diferencial" con 3 día(s) de retraso.',
        'APP', 'ENVIADA', false, 'MULTA:M-0001', 0, now() - interval '5 days', now() - interval '5 days'),
    ('N-0005', 'U104', 'P-0007', 'CONFIRMACION', 'Recogiste "Bases de datos". Devuélvelo dentro de 5 días.',
        'APP', 'ENVIADA', false, 'ENTREGA:P-0007', 0, now() - interval '2 days', now() - interval '2 days')
ON CONFLICT DO NOTHING;

SELECT setval('notificacion_seq', GREATEST((SELECT max(substr(id_notificacion, 3)::int) FROM notificacion), 1));
