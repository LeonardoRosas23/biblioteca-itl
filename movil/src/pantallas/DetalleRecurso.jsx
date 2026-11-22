import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../api/cliente';
import { Boton, Estado, Mensaje } from '../componentes/comunes';
import { useCarga } from '../hooks/useCarga';
import { base, color } from '../tema';

/** Detalle del recurso y CU01 · Solicitar préstamo. */
export default function DetalleRecurso({ route, navigation }) {
  const { idRecurso } = route.params;
  const { datos: r, error, recargar } = useCarga(() => api.recurso(idRecurso), [idRecurso]);
  const [enviando, setEnviando] = useState(false);
  const [errorSolicitud, setErrorSolicitud] = useState(null);

  async function solicitar() {
    setEnviando(true);
    setErrorSolicitud(null);
    try {
      const p = await api.solicitar(idRecurso);
      navigation.replace('Confirmacion', { prestamo: p });
    } catch (e) {
      setErrorSolicitud(e);
      if (e.status === 409) recargar(); // A3: actualiza la disponibilidad mostrada
    } finally {
      setEnviando(false);
    }
  }

  if (error) {
    return (
      <View style={[base.pantalla, base.contenido]}>
        <Mensaje>{error.message}</Mensaje>
      </View>
    );
  }
  if (!r) return <View style={base.pantalla} />;

  const puede = r.estado === 'DISPONIBLE' && r.disponibles > 0;
  return (
    <ScrollView style={base.pantalla} contentContainerStyle={base.contenido}>
      <Text style={base.titulo} accessibilityRole="header">
        {r.titulo}
      </Text>
      <Estado valor={r.estado} />
      <View style={base.tarjeta}>
        <Fila etiqueta="Categoría" valor={{ LIBRO: 'Libro', EQUIPO: 'Equipo', LABORATORIO: 'Laboratorio' }[r.categoria] || r.categoria} />
        <Fila etiqueta="Ubicación" valor={r.ubicacion} />
        <Fila etiqueta="Disponibles" valor={`${r.disponibles} de ${r.existencias} ejemplares`} />
      </View>
      {r.descripcion ? <Text style={base.texto}>{r.descripcion}</Text> : null}
      {errorSolicitud ? (
        <Mensaje>
          {errorSolicitud.codigo === 'MULTA_PENDIENTE'
            ? 'Tienes una multa pendiente. Consulta Mis préstamos para verla.'
            : errorSolicitud.message}
        </Mensaje>
      ) : null}
      <Boton titulo="Solicitar préstamo" alPresionar={solicitar} cargando={enviando} deshabilitado={!puede} />
      <Text style={base.secundario}>Requiere sesión activa, sin multas pendientes y dentro del límite de préstamos.</Text>
    </ScrollView>
  );
}

function Fila({ etiqueta, valor }) {
  return (
    <View style={s.fila}>
      <Text style={base.secundario}>{etiqueta}</Text>
      <Text style={[base.texto, { fontWeight: '600' }]}>{valor}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  fila: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.linea }
});
