import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { api } from '../api/cliente';
import { Boton, Estado, Mensaje } from '../componentes/comunes';
import { useCarga } from '../hooks/useCarga';
import { base, color, columnasPara } from '../tema';

const CATEGORIAS = [
  ['', 'Todos'],
  ['LIBRO', 'Libros'],
  ['EQUIPO', 'Equipo'],
  ['LABORATORIO', 'Lab.']
];
const NOMBRE = { LIBRO: 'Libro', EQUIPO: 'Equipo', LABORATORIO: 'Laboratorio' };

/** CU02 · Consultar catálogo. */
export default function Catalogo({ navigation }) {
  const { width } = useWindowDimensions();
  const columnas = columnasPara(width);
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState('');
  const { datos, error, cargando, recargar } = useCarga(
    () => api.recursos({ titulo: busqueda, categoria, tamano: 50 }),
    [busqueda, categoria]
  );

  const limpiar = () => {
    setTexto('');
    setBusqueda('');
    setCategoria('');
  };

  return (
    <View style={base.pantalla}>
      <View style={s.cabecera}>
        <TextInput
          style={base.entrada}
          accessibilityLabel="Buscar recurso"
          placeholder="Buscar recurso..."
          returnKeyType="search"
          value={texto}
          onChangeText={setTexto}
          onSubmitEditing={() => setBusqueda(texto.trim())}
        />
        <View style={s.chips} accessibilityRole="tablist">
          {CATEGORIAS.map(([codigo, nombre]) => {
            const activa = categoria === codigo;
            return (
              <Pressable
                key={nombre}
                accessibilityRole="tab"
                accessibilityState={{ selected: activa }}
                onPress={() => setCategoria(codigo)}
                style={[s.chip, activa && s.chipActiva]}
              >
                <Text style={[s.chipTexto, activa && { color: color.blanco }]}>{nombre}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <FlatList
        key={`cols-${columnas}`}
        testID="lista-catalogo"
        numColumns={columnas}
        data={datos?.items || []}
        keyExtractor={(r) => r.idRecurso}
        contentContainerStyle={base.contenido}
        columnWrapperStyle={columnas > 1 ? { gap: 12 } : undefined}
        refreshControl={<RefreshControl refreshing={cargando && !!datos} onRefresh={recargar} />}
        ListHeaderComponent={error ? <Mensaje>{error.message}</Mensaje> : null}
        ListEmptyComponent={
          !cargando && !error ? (
            <View style={[base.tarjeta, { alignItems: 'flex-start' }]}>
              <Text style={base.texto}>No se encontraron recursos.</Text>
              <Boton titulo="Limpiar filtros" variante="secundario" alPresionar={limpiar} />
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.titulo}, ${NOMBRE[item.categoria] || item.categoria}`}
            onPress={() => navigation.navigate('Detalle', { idRecurso: item.idRecurso })}
            style={[base.tarjeta, columnas > 1 && { flex: 1 / columnas }]}
          >
            <Text style={s.tituloRecurso}>{item.titulo}</Text>
            <Text style={base.secundario}>
              {NOMBRE[item.categoria] || item.categoria} · {item.ubicacion}
            </Text>
            <Estado valor={item.estado} />
          </Pressable>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  cabecera: { padding: 16, paddingBottom: 0, gap: 10 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: color.tinta, justifyContent: 'center' },
  chipActiva: { backgroundColor: color.tinta },
  chipTexto: { color: color.tinta, fontWeight: '600' },
  tituloRecurso: { fontSize: 17, fontWeight: '700', color: color.texto }
});
