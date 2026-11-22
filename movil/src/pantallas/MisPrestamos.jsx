import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/cliente';
import { Boton, Estado, Mensaje } from '../componentes/comunes';
import { useCarga } from '../hooks/useCarga';
import { useSesion } from '../sesion/SesionContext';
import { base, color, fecha, pesos } from '../tema';

const PESTANAS = [
  ['activos', 'Activos'],
  ['vencidos', 'Vencidos'],
  ['historial', 'Historial']
];

/** Agrupa los préstamos como en la pantalla 4 del diseño. */
export function agrupar(items = []) {
  return {
    activos: items.filter((p) => p.estado === 'ACTIVO' || p.estado === 'PENDIENTE_ENTREGA'),
    vencidos: items.filter((p) => p.estado === 'VENCIDO'),
    historial: items.filter((p) => p.estado === 'FINALIZADO' || p.estado === 'RECHAZADO')
  };
}

/** CU06 y CU07 · Mis préstamos, renovación y multas. */
export default function MisPrestamos() {
  const { usuario, cerrarSesion } = useSesion();
  const [pestana, setPestana] = useState('activos');
  const [aviso, setAviso] = useState(null);
  const [errorAccion, setErrorAccion] = useState(null);
  const { datos, error, cargando, recargar } = useCarga(() => api.misPrestamos(), []);
  useFocusEffect(useCallback(() => { recargar(); }, [recargar]));

  const grupos = agrupar(datos?.items);
  const multasPendientes = (datos?.items || []).filter((p) => p.multa?.estadoPago === 'PENDIENTE');

  async function renovar(p) {
    setAviso(null);
    setErrorAccion(null);
    try {
      const r = await api.renovar(p.idPrestamo);
      setAviso(`Renovado. Nueva fecha límite: ${fecha(r.fechaDevolucionEstimada)}.`);
      recargar();
    } catch (e) {
      setErrorAccion(e.message);
    }
  }

  return (
    <ScrollView style={base.pantalla} contentContainerStyle={base.contenido} refreshControl={<RefreshControl refreshing={false} onRefresh={recargar} />}>
      <View style={s.encabezado}>
        <Text style={base.titulo} accessibilityRole="header">
          Mis préstamos
        </Text>
        <Pressable accessibilityRole="button" onPress={() => cerrarSesion(null)} style={s.salir}>
          <Text style={{ color: color.info, fontWeight: '600' }}>Cerrar sesión</Text>
        </Pressable>
      </View>
      <Text style={base.secundario}>{usuario?.nombre}</Text>

      {multasPendientes.length > 0 && (
        <Mensaje>
          Tienes {multasPendientes.length === 1 ? 'una multa pendiente' : `${multasPendientes.length} multas pendientes`} por{' '}
          {pesos(multasPendientes.reduce((t, p) => t + Number(p.multa.montoCalculado), 0))}. Págala en la biblioteca para volver a pedir.
        </Mensaje>
      )}

      <View style={s.pestanas} accessibilityRole="tablist">
        {PESTANAS.map(([k, t]) => (
          <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: pestana === k }} onPress={() => setPestana(k)} style={[s.pestana, pestana === k && s.pestanaActiva]}>
            <Text style={[s.pestanaTexto, pestana === k && { color: color.tinta }]}>
              {t} ({grupos[k].length})
            </Text>
          </Pressable>
        ))}
      </View>

      {aviso ? <Mensaje tipo="exito">{aviso}</Mensaje> : null}
      {errorAccion ? <Mensaje>{errorAccion}</Mensaje> : null}
      {error ? <Mensaje>{error.message}</Mensaje> : null}

      {!cargando && grupos[pestana].length === 0 && (
        <Text style={base.texto}>{pestana === 'activos' ? 'No tienes préstamos activos. Busca un recurso en el catálogo.' : 'No hay préstamos en esta sección.'}</Text>
      )}

      {grupos[pestana].map((p) => (
        <View key={p.idPrestamo} style={base.tarjeta} testID={`prestamo-${p.idPrestamo}`}>
          <Text style={s.recurso}>{p.tituloRecurso}</Text>
          <Estado valor={p.estado} />
          {p.estado === 'PENDIENTE_ENTREGA' && <Text style={base.texto}>Recoger antes de: {fecha(p.reservaVigenteHasta)}</Text>}
          {(p.estado === 'ACTIVO' || p.estado === 'VENCIDO') && <Text style={base.texto}>Fecha límite: {fecha(p.fechaDevolucionEstimada)}</Text>}
          {p.estado === 'FINALIZADO' && <Text style={base.secundario}>Devuelto el {fecha(p.fechaDevolucionReal)}</Text>}
          {p.multa && (
            <Text style={[base.texto, { color: p.multa.estadoPago === 'PENDIENTE' ? color.peligro : color.texto2 }]}>
              Multa {p.multa.estadoPago === 'PENDIENTE' ? 'pendiente' : p.multa.estadoPago.toLowerCase()}: {pesos(p.multa.montoCalculado)}
            </Text>
          )}
          {p.estado === 'ACTIVO' && <Boton titulo="Renovar" variante="secundario" alPresionar={() => renovar(p)} />}
        </View>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  encabezado: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  salir: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  pestanas: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: color.linea },
  pestana: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  pestanaActiva: { borderBottomColor: color.laton },
  pestanaTexto: { color: color.texto2, fontWeight: '600' },
  recurso: { fontSize: 17, fontWeight: '700', color: color.texto }
});
