// Límite de intentos fallidos de inicio de sesión por correo (RNF06).
// Tras `max` fallos dentro de la ventana, la cuenta queda en espera hasta que la ventana expire.
// Vive en memoria: basta para una sola instancia del servicio. Con varias réplicas
// habría que moverlo a un almacén compartido (p. ej. Redis).
class LimiteIntentos {
  constructor({ max = 5, ventanaSeg = 900, reloj = () => Date.now() } = {}) {
    this.max = max;
    this.ventanaMs = ventanaSeg * 1000;
    this.reloj = reloj;
    this.fallos = new Map(); // clave -> { cuenta, desde }
  }

  _vigente(clave) {
    const f = this.fallos.get(clave);
    if (f && this.reloj() - f.desde >= this.ventanaMs) {
      this.fallos.delete(clave);
      return null;
    }
    return f || null;
  }

  /** Segundos que faltan para poder intentar de nuevo; 0 si no está bloqueado. */
  esperaSeg(clave) {
    const f = this._vigente(clave);
    if (!f || f.cuenta < this.max) return 0;
    return Math.ceil((f.desde + this.ventanaMs - this.reloj()) / 1000);
  }

  registrarFallo(clave) {
    const f = this._vigente(clave);
    if (f) f.cuenta += 1;
    else this.fallos.set(clave, { cuenta: 1, desde: this.reloj() });
    if (this.fallos.size > 10000) this._limpiar();
  }

  limpiar(clave) {
    this.fallos.delete(clave);
  }

  _limpiar() {
    for (const clave of this.fallos.keys()) this._vigente(clave);
  }
}

module.exports = { LimiteIntentos };
