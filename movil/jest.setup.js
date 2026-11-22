import '@testing-library/react-native/extend-expect';
// Almacén seguro simulado en memoria (en el dispositivo es Keychain / Keystore)
const mockAlmacen = new Map();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn((k) => Promise.resolve(mockAlmacen.has(k) ? mockAlmacen.get(k) : null)),
  setItemAsync: jest.fn((k, v) => { mockAlmacen.set(k, v); return Promise.resolve(); }),
  deleteItemAsync: jest.fn((k) => { mockAlmacen.delete(k); return Promise.resolve(); }),
  __almacen: mockAlmacen
}));
beforeEach(() => mockAlmacen.clear());

// SafeAreaProvider no mide la pantalla en pruebas: se usa el mock oficial de la biblioteca
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
