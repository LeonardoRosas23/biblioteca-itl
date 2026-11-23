import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { guardarServidor, normalizarServidor, probarServidor, servidorActual } from '../api/cliente';
import { Boton, Mensaje } from '../componentes/comunes';
import { useSesion } from '../sesion/SesionContext';
import { base, color } from '../tema';

/**
 * Dirección del servidor (gateway). Con el sistema en una laptop, cambia según la red:
 * Wi-Fi → http://IP-de-la-laptop:8080 · cable USB con "adb reverse" → http://localhost:8080.
 */
function Servidor() {
  const [url, setUrl] = useState(servidorActual());
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(url);
  const [probando, setProbando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  async function probarYGuardar() {
    const nueva = normalizarServidor(texto);
    if (!nueva) {
      setMensaje({ tipo: 'error', texto: 'Escribe una dirección como http://192.168.1.50:8080' });
      return;
    }
    setProbando(true);
    setMensaje(null);
    const ok = await probarServidor(nueva);
    setProbando(false);
    if (!ok) {
      setMensaje({
        tipo: 'error',
        texto: `No responde ${nueva}. Revisa que la laptop y el teléfono estén en la misma red y que el sistema esté encendido.`
      });
      return;
    }
    await guardarServidor(nueva);
    setUrl(nueva);
    setTexto(nueva);
    setEditando(false);
    setMensaje({ tipo: 'exito', texto: 'Conectado con el servidor.' });
  }

  return (
    <View style={s.servidor}>
      <Text style={base.secundario}>
        Servidor: <Text style={s.url}>{url}</Text>
      </Text>
      {!editando ? (
        <Pressable accessibilityRole="button" onPress={() => { setEditando(true); setMensaje(null); }} style={s.enlace}>
          <Text style={s.enlaceTexto}>Cambiar servidor</Text>
        </Pressable>
      ) : (
        <View style={{ gap: 8 }}>
          <TextInput
            style={base.entrada}
            accessibilityLabel="Dirección del servidor"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            value={texto}
            onChangeText={setTexto}
          />
          <Text style={base.secundario}>
            Misma red Wi-Fi: http://IP-de-la-laptop:8080 · Cable USB: http://localhost:8080
          </Text>
          <Boton titulo="Probar y guardar" alPresionar={probarYGuardar} cargando={probando} />
          <Boton titulo="Cancelar" variante="secundario" alPresionar={() => { setEditando(false); setTexto(url); setMensaje(null); }} />
        </View>
      )}
      {mensaje ? <Mensaje tipo={mensaje.tipo === 'exito' ? 'exito' : undefined}>{mensaje.texto}</Mensaje> : null}
    </View>
  );
}

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
          <Servidor />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  servidor: { marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E2DED3', gap: 6 },
  url: { fontWeight: '600' },
  enlace: { minHeight: 44, justifyContent: 'center' },
  enlaceTexto: { color: color.tinta, fontWeight: '600', textDecorationLine: 'underline', fontSize: 15 },
  fondo: { flex: 1, backgroundColor: color.tinta },
  centro: { flexGrow: 1, justifyContent: 'center', padding: 16 },
  tarjeta: {
    backgroundColor: color.blanco, borderRadius: 12, padding: 24, gap: 10, width: '100%', maxWidth: 420, alignSelf: 'center',
    borderTopWidth: 6, borderTopColor: color.laton
  }
});
