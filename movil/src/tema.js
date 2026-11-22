import { StyleSheet } from 'react-native';

export const color = {
  tinta: '#1F3B4D',
  papel: '#F5F7F6',
  blanco: '#FFFFFF',
  laton: '#B8892B',
  linea: '#D6DDE0',
  texto: '#18242C',
  texto2: '#52626C',
  ok: '#2F7D4F',
  info: '#2B5F9E',
  aviso: '#8A6D1F',
  peligro: '#B3261E',
  pendiente: '#5D4A91'
};

// Sección 7.4: etiqueta en texto claro + tono
export const ESTADOS = {
  DISPONIBLE: ['Disponible', color.ok],
  RESERVADO: ['Reservado', color.info],
  PRESTADO: ['Prestado', color.info],
  MANTENIMIENTO: ['En mantenimiento', color.aviso],
  SIN_EXISTENCIAS: ['Sin existencias', color.texto2],
  INACTIVO: ['No disponible', color.texto2],
  PENDIENTE_ENTREGA: ['Pendiente de recoger', color.pendiente],
  ACTIVO: ['Activo', color.ok],
  VENCIDO: ['Vencido', color.peligro],
  FINALIZADO: ['Devuelto', color.texto2],
  RECHAZADO: ['Rechazado', color.texto2]
};

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** '2026-10-16' o ISO → '16 oct 2026' en hora de México (sin depender de Intl, que varía en Android). */
export function fecha(valor) {
  if (!valor) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const [a, m, d] = valor.split('-').map(Number);
    return `${d} ${MESES[m - 1]} ${a}`;
  }
  const local = new Date(new Date(valor).getTime() - 6 * 3600_000); // UTC-6, México sin horario de verano
  return `${local.getUTCDate()} ${MESES[local.getUTCMonth()]} ${local.getUTCFullYear()}`;
}

export const pesos = (n) => `$${Number(n || 0).toFixed(2)}`;

/** Diseño responsivo: 1 columna en teléfono, 2 en tableta vertical, 3 en tableta horizontal. */
export function columnasPara(ancho) {
  if (ancho >= 1000) return 3;
  if (ancho >= 600) return 2;
  return 1;
}

export const base = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.papel },
  contenido: { padding: 16, gap: 12 },
  titulo: { fontSize: 24, fontWeight: '700', color: color.tinta },
  texto: { fontSize: 16, color: color.texto, lineHeight: 22 },
  secundario: { fontSize: 14, color: color.texto2 },
  tarjeta: { backgroundColor: color.blanco, borderRadius: 8, borderWidth: 1, borderColor: color.linea, padding: 16, gap: 6 },
  entrada: {
    minHeight: 48, borderWidth: 1, borderColor: '#B9C4C9', borderRadius: 6, paddingHorizontal: 12,
    fontSize: 16, backgroundColor: color.blanco, color: color.texto
  },
  etiqueta: { fontSize: 15, fontWeight: '600', color: color.texto }
});
