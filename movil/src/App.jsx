import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Navegacion from './navegacion/Navegacion';
import { SesionProvider } from './sesion/SesionContext';

export default function App() {
  return (
    <SafeAreaProvider>
      <SesionProvider>
        <StatusBar style="light" />
        <Navegacion />
      </SesionProvider>
    </SafeAreaProvider>
  );
}
