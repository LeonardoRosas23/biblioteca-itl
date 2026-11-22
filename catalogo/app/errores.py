class ApiError(Exception):
    """Error de dominio con el formato común { codigo, mensaje, correlacionId }."""

    def __init__(self, status: int, codigo: str, mensaje: str):
        super().__init__(mensaje)
        self.status = status
        self.codigo = codigo
        self.mensaje = mensaje


def no_encontrado(m="El recurso no existe."):
    return ApiError(404, "RECURSO_NO_ENCONTRADO", m)


def conflicto(codigo, m):
    return ApiError(409, codigo, m)


def invalido(m):
    return ApiError(400, "DATOS_INVALIDOS", m)


def no_autenticado(m="Se requiere un token válido."):
    return ApiError(401, "NO_AUTENTICADO", m)


def prohibido(m="Tu rol no permite esta acción."):
    return ApiError(403, "ACCESO_DENEGADO", m)
