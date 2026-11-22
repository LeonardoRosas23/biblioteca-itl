import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Boton, Mensaje } from '../componentes/comunes';
import { useSesion } from '../sesion/SesionContext';
import { base, color } from '../tema';

export default function Login({ navigation }) {
  const { iniciarSesion, motivoCierre } = useSesion();
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar() {
    if (!correo.trim() || !password) {
      setError('Captura tu correo institucional y tu contraseña.');
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      await iniciarSesion(correo.trim(), password);
    } catch (e) {
      setError(e.message);
      setEnviando(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.fondo} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.centro} keyboardShouldPersistTaps="handled">
        <View style={s.tarjeta}>
          <Text style={base.secundario}>Instituto Tecnológico de León</Text>
          <Text style={base.titulo} accessibilityRole="header">
            Biblioteca ITL
          </Text>
          <Text style={[base.secundario, { marginBottom: 8 }]}>Préstamo de libros, equipo y material de laboratorio</Text>
          {motivoCierre ? <Mensaje tipo="aviso">{motivoCierre}</Mensaje> : null}
          <Text style={base.etiqueta} nativeID="lbl-correo">
            Correo institucional
          </Text>
          <TextInput
            style={base.entrada}
            accessibilityLabel="Correo institucional"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="correo@itleon.edu.mx"
            value={correo}
            onChangeText={setCorreo}
          />
          <Text style={base.etiqueta}>Contraseña</Text>
          <TextInput
            style={base.entrada}
            accessibilityLabel="Contraseña"
            secureTextEntry
            autoComplete="password"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={entrar}
          />
          <Mensaje>{error}</Mensaje>
          <Boton titulo="Iniciar sesión" alPresionar={entrar} cargando={enviando} />
          <Text style={[base.secundario, { textAlign: 'center', marginTop: 4 }]}>¿No tienes cuenta?</Text>
          <Boton titulo="Regístrate" variante="secundario" alPresionar={() => navigation.navigate('Registro')} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: color.tinta },
  centro: { flexGrow: 1, justifyContent: 'center', padding: 16 },
  tarjeta: {
    backgroundColor: color.blanco, borderRadius: 12, padding: 24, gap: 10, width: '100%', maxWidth: 420, alignSelf: 'center',
    borderTopWidth: 6, borderTopColor: color.laton
  }
});
