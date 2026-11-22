import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../api/cliente';
import { Boton, Mensaje } from '../componentes/comunes';
import { useSesion } from '../sesion/SesionContext';
import { base, color } from '../tema';

// CU08-A3 · Registro de alumnos y profesores (RN10: el autorregistro solo crea esos dos roles).

const ROLES = [
  ['ALUMNO', 'Alumno'],
  ['PROFESOR', 'Profesor']
];

/** Validación antes de enviar (sección 7.5). Devuelve { campo: mensaje }. */
export function validarRegistro({ nombre, correo, password, confirmacion }) {
  const e = {};
  if (!nombre.trim()) e.nombre = 'Escribe tu nombre completo.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim())) e.correo = 'Escribe tu correo institucional (nombre@itleon.edu.mx).';
  if (password.length < 8) e.password = 'La contraseña debe tener al menos 8 caracteres.';
  else if (password !== confirmacion) e.confirmacion = 'Las contraseñas no coinciden.';
  return e;
}

function Campo({ etiqueta, error, ...props }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={base.etiqueta}>{etiqueta}</Text>
      <TextInput
        style={[base.entrada, error && { borderColor: color.peligro }]}
        accessibilityLabel={etiqueta}
        accessibilityHint={error || undefined}
        {...props}
      />
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

export default function Registro({ navigation }) {
  const { iniciarSesion } = useSesion();
  const [datos, setDatos] = useState({ nombre: '', correo: '', password: '', confirmacion: '', rol: 'ALUMNO' });
  const [errores, setErrores] = useState({});
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const cambiar = (campo) => (v) => setDatos((d) => ({ ...d, [campo]: v }));

  async function registrar() {
    const v = validarRegistro(datos);
    setErrores(v);
    setError(null);
    if (Object.keys(v).length) return;
    setEnviando(true);
    const correo = datos.correo.trim().toLowerCase();
    try {
      await api.registrar({ nombre: datos.nombre.trim(), correo, password: datos.password, rol: datos.rol });
    } catch (e) {
      setError(e.message);
      setEnviando(false);
      return;
    }
    try {
      // La cuenta ya existe: se inicia sesión directamente y se abre el catálogo
      await iniciarSesion(correo, datos.password);
    } catch (e) {
      setEnviando(false);
      navigation.navigate('Login');
    }
  }

  return (
    <KeyboardAvoidingView style={s.fondo} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
        <Text style={base.secundario}>Usa tu correo del Tecnológico. El personal de biblioteca recibe su cuenta de un administrador.</Text>
        <Campo etiqueta="Nombre completo" value={datos.nombre} onChangeText={cambiar('nombre')} error={errores.nombre} autoComplete="name" />
        <Campo
          etiqueta="Correo institucional"
          value={datos.correo}
          onChangeText={cambiar('correo')}
          error={errores.correo}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="correo@itleon.edu.mx"
        />
        <Campo etiqueta="Contraseña" value={datos.password} onChangeText={cambiar('password')} error={errores.password} secureTextEntry autoComplete="new-password" />
        <Campo
          etiqueta="Confirmar contraseña"
          value={datos.confirmacion}
          onChangeText={cambiar('confirmacion')}
          error={errores.confirmacion}
          secureTextEntry
          autoComplete="new-password"
        />
        <Text style={base.etiqueta} nativeID="lbl-rol">
          Soy
        </Text>
        <View style={s.opciones} accessibilityRole="radiogroup" accessibilityLabelledBy="lbl-rol">
          {ROLES.map(([valor, texto]) => {
            const elegido = datos.rol === valor;
            return (
              <Pressable
                key={valor}
                accessibilityRole="radio"
                accessibilityState={{ checked: elegido }}
                accessibilityLabel={texto}
                onPress={() => cambiar('rol')(valor)}
                style={[s.opcion, elegido && s.opcionElegida]}
              >
                <Text style={[s.opcionTexto, elegido && { color: color.blanco }]}>{texto}</Text>
              </Pressable>
            );
          })}
        </View>
        <Mensaje>{error}</Mensaje>
        <Boton titulo="Crear cuenta" alPresionar={registrar} cargando={enviando} />
        <Boton titulo="Ya tengo cuenta" variante="secundario" alPresionar={() => navigation.navigate('Login')} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: color.papel },
  contenido: { padding: 16, gap: 12, width: '100%', maxWidth: 480, alignSelf: 'center' },
  error: { color: color.peligro, fontSize: 14 },
  opciones: { flexDirection: 'row', gap: 8 },
  opcion: {
    flex: 1, minHeight: 48, borderWidth: 1, borderColor: color.tinta, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center', backgroundColor: color.blanco
  },
  opcionElegida: { backgroundColor: color.tinta },
  opcionTexto: { fontSize: 16, fontWeight: '600', color: color.tinta }
});
