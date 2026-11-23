// Política de contraseñas (RNF06), basada en NIST SP 800-63B y OWASP:
// 8 a 64 caracteres, al menos una mayúscula, una minúscula, un número y un carácter especial,
// sin espacios y sin incluir el usuario del correo. El servidor, la app y el panel usan la misma regla.
const MIN = 8;
const MAX = 64;

const REQUISITOS = [
  { id: 'longitud', texto: `Entre ${MIN} y ${MAX} caracteres`, cumple: (p) => p.length >= MIN && p.length <= MAX },
  { id: 'mayuscula', texto: 'Una letra mayúscula', cumple: (p) => /\p{Lu}/u.test(p) },
  { id: 'minuscula', texto: 'Una letra minúscula', cumple: (p) => /\p{Ll}/u.test(p) },
  { id: 'numero', texto: 'Un número', cumple: (p) => /[0-9]/.test(p) },
  { id: 'especial', texto: 'Un carácter especial (! @ # $ % & * - _ . ?)', cumple: (p) => /[^\p{L}\p{N}\s]/u.test(p) },
  { id: 'espacios', texto: 'Sin espacios', cumple: (p) => !/\s/.test(p) }
];

/** Devuelve cada requisito con { id, texto, ok } para mostrar la lista en pantalla. */
function revisarPassword(password = '', correo = '') {
  const p = String(password);
  const lista = REQUISITOS.map((r) => ({ id: r.id, texto: r.texto, ok: r.cumple(p) }));
  const usuario = String(correo).split('@')[0].trim().toLowerCase();
  if (usuario.length >= 3) {
    lista.push({ id: 'correo', texto: 'Que no contenga tu usuario del correo', ok: !p.toLowerCase().includes(usuario) });
  }
  return lista;
}

/** Mensaje de error con lo que falta, o null si la contraseña es válida. */
function errorPassword(password, correo) {
  const faltan = revisarPassword(password, correo).filter((r) => !r.ok);
  if (!faltan.length) return null;
  return `La contraseña debe cumplir: ${faltan.map((r) => r.texto.charAt(0).toLowerCase() + r.texto.slice(1)).join('; ')}.`;
}

module.exports = { revisarPassword, errorPassword, MIN_PASSWORD: MIN, MAX_PASSWORD: MAX };
