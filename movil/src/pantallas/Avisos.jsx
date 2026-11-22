import { useCallback } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/cliente';
import { Mensaje } from '../componentes/comunes';
import { useCarga } from '../hooks/useCarga';
import { base, color, fecha } from '../tema';

const TIPOS = {
  CONFIRMACION: ['Confirmación', color.info],
  RECORDATORIO: ['Recordatorio', color.aviso],
  ALERTA_MULTA: ['Alerta de multa', color.peligro],
  VENCIMIENTO: ['Préstamo vencido', color.peligro]
};

/** Pantalla 6 · Avisos (CU09). */
export default function Avisos() {
  const { datos, error, cargando, recargar } = useCarga(() => api.avisos(), []);
  useFocusEffect(useCallback(() => { recargar(); }, [recargar]));

  async function leer(n) {
    if (n.leida) return;
    try {
      await api.marcarLeido(n.idNotificacion);
      recargar();
    } catch {
      /* no bloquea la lectura */
    }
  }

  return (
    <ScrollView style={base.pantalla} contentContainerStyle={base.contenido} refreshControl={<RefreshControl refreshing={false} onRefresh={recargar} />}>
      <Text style={base.titulo} accessibilityRole="header">
        Avisos
      </Text>
      {error ? <Mensaje>{error.message}</Mensaje> : null}
      {!cargando && datos?.items.length === 0 && <Text style={base.texto}>Aún no tienes avisos.</Text>}
      {(datos?.items || []).map((n) => {
        const [tipo, tono] = TIPOS[n.tipo] || [n.tipo, color.texto2];
        return (
          <Pressable
            key={n.idNotificacion}
            accessibilityRole="button"
            accessibilityHint={n.leida ? undefined : 'Marca el aviso como leído'}
            onPress={() => leer(n)}
            style={[base.tarjeta, { borderLeftWidth: 4, borderLeftColor: tono }]}
          >
            <View style={s.fila}>
              <Text style={[s.tipo, { color: tono }]}>{tipo}</Text>
              {!n.leida && <Text style={s.nuevo}>Nuevo</Text>}
            </View>
            <Text style={base.texto}>{n.mensaje}</Text>
            <Text style={base.secundario}>{fecha(n.fechaCreacion)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  fila: { flexDirection: 'row', justifyContent: 'space-between' },
  tipo: { fontWeight: '700' },
  nuevo: { color: color.laton, fontWeight: '700' }
});
