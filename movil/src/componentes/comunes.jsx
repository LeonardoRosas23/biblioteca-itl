import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { ESTADOS, color } from '../tema';

export function Estado({ valor }) {
  const [texto, tono] = ESTADOS[valor] || [valor, color.texto2];
  return (
    <View style={[s.estado, { borderColor: tono }]}>
      <Text style={[s.estadoTexto, { color: tono }]}>{texto}</Text>
    </View>
  );
}

/** Botón con área táctil mínima de 44 pt (sección 7.5). */
export function Boton({ titulo, alPresionar, variante = 'primario', deshabilitado, cargando }) {
  const primario = variante === 'primario';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(deshabilitado || cargando) }}
      disabled={deshabilitado || cargando}
      onPress={alPresionar}
      style={({ pressed }) => [s.boton, primario ? s.primario : s.secundario, (pressed || deshabilitado) && { opacity: 0.6 }]}
    >
      {cargando ? (
        <ActivityIndicator color={primario ? color.blanco : color.tinta} />
      ) : (
        <Text style={[s.botonTexto, { color: primario ? color.blanco : color.tinta }]}>{titulo}</Text>
      )}
    </Pressable>
  );
}

export function Mensaje({ tipo = 'error', children }) {
  if (!children) return null;
  const borde = { error: color.peligro, aviso: color.laton, exito: color.ok }[tipo];
  return (
    <View style={[s.mensaje, { borderLeftColor: borde }]} accessibilityRole={tipo === 'error' ? 'alert' : 'text'} accessibilityLiveRegion="polite">
      <Text style={s.mensajeTexto}>{children}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  estado: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  estadoTexto: { fontSize: 13, fontWeight: '600' },
  boton: { minHeight: 48, borderRadius: 6, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primario: { backgroundColor: color.tinta },
  secundario: { backgroundColor: color.blanco, borderWidth: 1, borderColor: color.tinta },
  botonTexto: { fontSize: 16, fontWeight: '600' },
  mensaje: { backgroundColor: color.blanco, borderLeftWidth: 4, borderRadius: 6, padding: 12 },
  mensajeTexto: { fontSize: 15, color: color.texto }
});
