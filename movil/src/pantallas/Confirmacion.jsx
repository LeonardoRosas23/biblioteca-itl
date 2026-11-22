import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Boton } from '../componentes/comunes';
import { base, color, fecha } from '../tema';

/** Pantalla 5 · Resultado de la solicitud y próximos pasos. */
export default function Confirmacion({ route, navigation }) {
  const { prestamo: p } = route.params;
  return (
    <ScrollView style={base.pantalla} contentContainerStyle={base.contenido}>
      <Text style={base.titulo} accessibilityRole="header">
        Solicitud registrada
      </Text>
      <View style={base.tarjeta}>
        <Fila e="Recurso" v={p.tituloRecurso} />
        <Fila e="Folio" v={p.idPrestamo} />
        <Fila e="Estado" v="Pendiente de recoger" />
        <Fila e="Recoger en" v="Mostrador de la biblioteca" />
        <Fila e="Antes de" v={fecha(p.reservaVigenteHasta)} />
      </View>
      <Text style={base.secundario}>Presenta tu credencial y el folio al recogerlo. Si no lo recoges a tiempo, la reserva se libera.</Text>
      <Boton titulo="Ver mis préstamos" alPresionar={() => navigation.navigate('MisPrestamos')} />
      <Boton titulo="Volver al catálogo" variante="secundario" alPresionar={() => navigation.popToTop()} />
    </ScrollView>
  );
}

function Fila({ e, v }) {
  return (
    <View style={s.fila}>
      <Text style={base.secundario}>{e}</Text>
      <Text style={[base.texto, { fontWeight: '600', flexShrink: 1, textAlign: 'right' }]}>{v}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  fila: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.linea }
});
