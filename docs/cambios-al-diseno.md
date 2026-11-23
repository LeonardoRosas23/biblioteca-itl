# Cambios respecto a la propuesta y al documento de diseño

Este documento registra en qué difiere la implementación de la **propuesta del proyecto (22/09)** y del **documento de requerimientos, análisis y diseño (segunda entrega, 9/10)**, y por qué. Sirve para actualizar el documento de diseño y para explicarlo en la presentación.

## 1. Cambios respecto a la propuesta

### Tecnologías: de un solo stack en JavaScript a cuatro lenguajes

| Componente | Propuesta (22/09) | Implementación |
|---|---|---|
| Usuarios y Autenticación | Node.js + Express | Node.js + Express (sin cambio) |
| Catálogo | Node.js + Express | Python + FastAPI |
| Préstamos y Multas | Node.js + Express | Java + Spring Boot |
| Notificaciones | Node.js + Express | Go + Fiber |
| ORM | Prisma o Sequelize | SQL directo con `pg` (Node), SQLAlchemy Core (Python), JPA/Hibernate (Java) y `pgx` (Go) |
| Pruebas | Jest | Jest (Node, web y móvil), pytest, JUnit 5 y `go test` |

**Justificación para la presentación.** El enunciado pide "multiplataforma de desarrollo (por lo menos 2)". Al pasar del análisis al diseño (9 de octubre), el equipo decidió que cada integrante del backend trabajara en una plataforma distinta para cumplir ese punto con holgura y demostrar que los microservicios se integran solo por contratos HTTP/JSON, sin compartir código ni base de datos (RNF01). Eso reemplazó la mitigación del riesgo 1 de la propuesta (un stack unificado en JavaScript para reducir la curva de aprendizaje). En su lugar, la curva de aprendizaje se mitigó así:

- Contratos de API acordados antes de programar (sección 5 del diseño).
- El mismo formato de errores, de paginación y de correlación en los cuatro servicios.
- Pruebas unitarias en cada servicio, con los servicios vecinos simulados.

En Usuarios no se usó Prisma ni Sequelize: el servicio solo tiene una tabla y unas cuantas consultas, así que SQL parametrizado con `pg` resultó más simple y transparente que un ORM.

### Responsabilidades

| Integrante | Propuesta (22/09) | Vigente (documento de diseño y código) |
|---|---|---|
| Rosas Pérez Leonardo Daniel | PM / Arquitecto de dominio | Coordinación y arquitectura del dominio · pruebas de integración y documentación |
| González Gallegos José de Jesús | Backend Lead: Préstamos y Catálogo | MS Préstamos y Multas (Java) |
| Navarro Negrete María Fernanda | Backend / BD: Usuarios, migraciones, datos de prueba | MS Usuarios y Autenticación (Node.js) |
| Luna García Erika Josabet | Frontend web | MS Notificaciones (Go) y panel web (React) |
| Gómez Juárez Alan Fabricio | Frontend móvil / DevOps | MS Catálogo (Python), Docker Compose, gateway y app móvil |

El cambio se hizo para que cada uno de los cuatro servicios tuviera un responsable distinto con su propio lenguaje. La matriz vigente es la de la sección 1.3 del documento de diseño; cada responsable presenta su parte.

## 2. Cambios respecto al documento de diseño

| Sección del diseño | Lo que decía | Lo que se implementó | Motivo |
|---|---|---|---|
| 5.1, 5.5, figuras 6.2 y 6.3 | Préstamos cambia el recurso con `PATCH /recursos/{id}/estado` (PRESTADO, DISPONIBLE, MANTENIMIENTO) | Endpoints internos sobre la reserva: `POST /recursos/{id}/reservas/{idPrestamo}/entrega` y `/devolucion` `{ danado }`; liberar con `DELETE …/reservas/{idPrestamo}`. `PATCH …/estado` quedó solo para el personal (inactivar, mantenimiento) | Con varias existencias el recurso no tiene un único estado: lo que cambia es una unidad de un contador. Operar sobre la reserva hace cada paso idempotente con el `idPrestamo` y evita que dos préstamos se pisen |
| 5.5 (nuevo) | — | `GET /api/v1/reservas` interno, para la conciliación de D5 | D5 pedía "una tarea de conciliación revisa reservas sin préstamo" y no tenía endpoint |
| 5.1, 5.8, 5.9 | Notificaciones con PostgreSQL + Redis | Solo PostgreSQL | El diseño lo dejaba como opcional; los reintentos se manejan con `proximo_reintento` en la tabla, sin otra pieza de infraestructura |
| 4.2 | Tipos de aviso: CONFIRMACION, RECORDATORIO, ALERTA_MULTA | Además `VENCIMIENTO` | CU09 paso 4 pide "un aviso de vencimiento para cada préstamo recién vencido" |
| 2.3, 5.9 | Una variable `DIAS_PRESTAMO` | `DIAS_PRESTAMO_LIBRO`, `DIAS_PRESTAMO_EQUIPO`, `DIAS_PRESTAMO_LABORATORIO` | La tabla 2.3 ya daba plazos distintos por tipo de recurso (7 libros, 3 equipo) |
| 2.3 (nuevos) | — | `DIAS_ESPERA` (ventana de la demanda que impide renovar), `ZONA_HORARIA` | RN06 y el cálculo de fechas en hora de León |
| 4.2, 7.4 | Estados del recurso: DISPONIBLE, RESERVADO, PRESTADO, MANTENIMIENTO, INACTIVO | Además `SIN_EXISTENCIAS` ("Sin existencias") | Un recurso con 0 existencias se mostraba como "En mantenimiento" |
| 5.5 Usuarios (nuevo) | — | `GET /api/v1/usuarios` (búsqueda paginada, personal) | Lo necesita la pantalla de Usuarios del panel |
| 5.5 Usuarios | — | El login responde 429 tras varios intentos fallidos | RNF06: evita adivinar contraseñas por fuerza bruta |
| 5.5 Usuarios | La contraseña solo pedía 8 caracteres | Política de contraseña: 8 a 64 caracteres, mayúscula, minúscula, número, carácter especial, sin espacios y sin el usuario del correo; la app y el panel muestran en vivo qué requisito falta | RNF06: contraseñas difíciles de adivinar (guía NIST SP 800-63B / OWASP) |
| 5.5 Notificaciones | `GET /notificaciones/{id}`: interno o propietario | También el personal | Consistente con RN09: el bibliotecario consulta lo de cualquier usuario |
| 7.1, 7.3 | Panel con Recursos, Préstamos y devoluciones, Multas | Además **Usuarios** (solo ADMIN) | Actor administrador (3.1) y tabla 5.7: bloquear cuentas y asignar roles |
| 7.2 | Seis pantallas móviles | Además la pantalla de **Registro** | CU08-A3 y el enlace "¿No tienes cuenta? Regístrate" de la maqueta 1 |
| 5.7, 5.9 | HTTPS en producción | El gateway escucha también en 8443 con TLS (certificado autofirmado si no se proporciona uno) | RNF06 |
| 1.4 fase 5, RNF05 | Prueba de carga con herramienta por definir | `catalogo/scripts/prueba_carga.py` (httpx) | Resultado en `docs/evidencia/catalogo_carga_rnf05.txt` |

## 3. Decisiones pendientes de la sección 8, ya tomadas en el código

| Decisión | Valor implementado |
|---|---|
| Política de multas | Tarifa diaria `TARIFA_DIARIA`, tolerancia `DIAS_TOLERANCIA`, tope `TOPE_MULTA` (valores de ejemplo: $10.00, 0, sin tope) |
| Límite y plazos | 3 préstamos; 7 días libros, 3 equipo, 3 laboratorio |
| Vigencia de la reserva | 72 horas; una tarea las expira cada 15 minutos |
| Lista de espera | No hay reserva anticipada; la demanda no atendida solo bloquea renovaciones (RN06) |
| Modelo de ejemplares | Contador (existencias y disponibles) |
| Método de envío | Aviso dentro de la app (canal `APP`); el correo queda como otra implementación de `Canal` |
| Hora de la tarea diaria | 8:00 a. m. hora de León (`CRON_VENCIMIENTOS`) |
| Contenedores | PostgreSQL 16 por servicio en Docker Compose, sin Redis |
| Gateway | Nginx |
| Token en la app | Almacén seguro del sistema (Keychain / Keystore con `expo-secure-store`) |

Los valores numéricos siguen siendo de ejemplo hasta que la institución los confirme; todos se cambian por variables de entorno.
