import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import Avisos from '../pantallas/Avisos';
import Catalogo from '../pantallas/Catalogo';
import Confirmacion from '../pantallas/Confirmacion';
import DetalleRecurso from '../pantallas/DetalleRecurso';
import Login from '../pantallas/Login';
import MisPrestamos from '../pantallas/MisPrestamos';
import Registro from '../pantallas/Registro';
import { useSesion } from '../sesion/SesionContext';
import { color } from '../tema';

const Pila = createNativeStackNavigator();
const Pestanas = createBottomTabNavigator();

const encabezado = { headerStyle: { backgroundColor: color.tinta }, headerTintColor: color.blanco };

function PilaCatalogo() {
  return (
    <Pila.Navigator screenOptions={encabezado}>
      <Pila.Screen name="Catalogo" component={Catalogo} options={{ title: 'Catálogo' }} />
      <Pila.Screen name="Detalle" component={DetalleRecurso} options={{ title: 'Detalle del recurso', headerBackTitle: 'Catálogo' }} />
      <Pila.Screen name="Confirmacion" component={Confirmacion} options={{ title: 'Confirmación', headerBackVisible: false }} />
    </Pila.Navigator>
  );
}

/** Mapa de navegación de la figura 7.1: sin sesión, login y registro; con sesión, barra inferior de 3 pestañas. */
export function Rutas() {
  const { cargando, sesion } = useSesion();
  if (cargando) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: color.tinta }}>
        <ActivityIndicator color={color.blanco} accessibilityLabel="Cargando" />
      </View>
    );
  }
  if (!sesion) {
    return (
      <Pila.Navigator screenOptions={encabezado}>
        <Pila.Screen name="Login" component={Login} options={{ headerShown: false }} />
        <Pila.Screen name="Registro" component={Registro} options={{ title: 'Crear cuenta', headerBackTitle: 'Iniciar sesión' }} />
      </Pila.Navigator>
    );
  }
  return (
    <Pestanas.Navigator
      screenOptions={{
        tabBarActiveTintColor: color.tinta,
        tabBarInactiveTintColor: color.texto2,
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
        tabBarIcon: () => null,
        tabBarIconStyle: { display: 'none' },
        tabBarStyle: { minHeight: 56 }
      }}
    >
      <Pestanas.Screen name="CatalogoTab" component={PilaCatalogo} options={{ title: 'Catálogo', headerShown: false }} />
      <Pestanas.Screen name="MisPrestamos" component={MisPrestamos} options={{ title: 'Mis préstamos', headerShown: false }} />
      <Pestanas.Screen name="Avisos" component={Avisos} options={{ title: 'Avisos', headerShown: false }} />
    </Pestanas.Navigator>
  );
}

export default function Navegacion() {
  return (
    <NavigationContainer>
      <Rutas />
    </NavigationContainer>
  );
}
