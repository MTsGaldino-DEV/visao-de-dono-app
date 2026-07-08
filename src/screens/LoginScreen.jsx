import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { useAuth } from '../context/AuthContext';
import { CORES } from '../constants/CORES';

/* ─── Ícone de olho (logo) ─── */
function EyeLogo({ size = 64, color = CORES.primario }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5Z"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M12 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"
        fill={color}
      />
    </Svg>
  );
}

/* ─── Ícone olho para o campo de senha ─── */
function EyeToggle({ visible, color = CORES.textoMuted }) {
  if (visible) {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Path
          d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5Z"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }

  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M17.94 17.94A10.07 10.07 0 0 1 12 19.5c-5 0-9.27-3.11-11-7.5a18.45 18.45 0 0 1 5.06-6.94"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M9.9 4.24A9.12 9.12 0 0 1 12 4c5 0 9.27 3.11 11 7.5a18.5 18.5 0 0 1-2.16 3.19"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M14.12 14.12a3.5 3.5 0 0 1-4.24-4.24"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="m1 1 22 22"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function LoginScreen() {
  const { login } = useAuth();

  const [matricula, setMatricula] = useState('');
  const [senha, setSenha] = useState('');
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  const [focusMatricula, setFocusMatricula] = useState(false);
  const [focusSenha, setFocusSenha] = useState(false);

  const senhaRef = useRef(null);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  function shake() {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }

  async function handleLogin() {
    Keyboard.dismiss();
    setErro('');

    if (!matricula.trim()) {
      setErro('Informe a matrícula.');
      shake();
      return;
    }
    if (!senha) {
      setErro('Informe a senha.');
      shake();
      return;
    }

    setCarregando(true);
    try {
      await login(matricula, senha);
    } catch (err) {
      const msg =
        err.message === 'Invalid login credentials'
          ? 'Matrícula ou senha incorretos.'
          : err.message || 'Erro ao fazer login.';
      setErro(msg);
      shake();
    } finally {
      setCarregando(false);
    }
  }

  const content = (
    <View style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <Animated.View
          style={[styles.card, { transform: [{ translateX: shakeAnim }] }]}
        >
          {/* Logo */}
          <View style={styles.logoContainer}>
            <View style={styles.logoCircle}>
              <EyeLogo size={48} color={CORES.primario} />
            </View>
            <Text style={styles.titulo}>Visão de Dono</Text>
            <Text style={styles.subtitulo}>Acesse sua conta</Text>
          </View>

          {/* Campo Matrícula */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Matrícula</Text>
            <TextInput
              style={[
                styles.input,
                focusMatricula && styles.inputFocused,
              ]}
              placeholder="Digite sua matrícula"
              placeholderTextColor={CORES.textoMuted}
              keyboardType="numeric"
              value={matricula}
              onChangeText={(t) => {
                setMatricula(t);
                if (erro) setErro('');
              }}
              onFocus={() => setFocusMatricula(true)}
              onBlur={() => setFocusMatricula(false)}
              returnKeyType="next"
              onSubmitEditing={() => senhaRef.current?.focus()}
              editable={!carregando}
            />
          </View>

          {/* Campo Senha */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Senha</Text>
            <View
              style={[
                styles.inputWrapper,
                focusSenha && styles.inputFocused,
              ]}
            >
              <TextInput
                ref={senhaRef}
                style={styles.inputSenha}
                placeholder="Digite sua senha"
                placeholderTextColor={CORES.textoMuted}
                secureTextEntry={!senhaVisivel}
                value={senha}
                onChangeText={(t) => {
                  setSenha(t);
                  if (erro) setErro('');
                }}
                onFocus={() => setFocusSenha(true)}
                onBlur={() => setFocusSenha(false)}
                returnKeyType="go"
                onSubmitEditing={handleLogin}
                editable={!carregando}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setSenhaVisivel(!senhaVisivel)}
                activeOpacity={0.6}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <EyeToggle visible={senhaVisivel} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Mensagem de erro */}
          {erro !== '' && (
            <View style={styles.erroContainer}>
              <Text style={styles.erroTexto}>{erro}</Text>
            </View>
          )}

          {/* Botão Entrar */}
          <TouchableOpacity
            onPress={handleLogin}
            activeOpacity={0.85}
            disabled={carregando}
            style={[styles.botao, carregando && styles.botaoDisabled]}
          >
            {carregando ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.botaoTexto}>Entrar</Text>
            )}
          </TouchableOpacity>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );

  if (Platform.OS === 'web') {
    return content;
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      {content}
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CORES.bgGlobal,
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: CORES.bgCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CORES.bordaPadrao,
    padding: 24,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#eef2f7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  titulo: {
    fontSize: 24,
    fontWeight: '700',
    color: CORES.primario,
    letterSpacing: 0.3,
  },
  subtitulo: {
    fontSize: 14,
    color: CORES.textoSecundario,
    marginTop: 4,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: CORES.textoPrincipal,
    marginBottom: 6,
  },
  input: {
    backgroundColor: CORES.bgInput,
    borderWidth: 1,
    borderColor: CORES.bordaPadrao,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: CORES.textoPrincipal,
  },
  inputFocused: {
    borderColor: CORES.azulAcao,
    borderWidth: 1.5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CORES.bgInput,
    borderWidth: 1,
    borderColor: CORES.bordaPadrao,
    borderRadius: 10,
  },
  inputSenha: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: CORES.textoPrincipal,
  },
  eyeButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  erroContainer: {
    backgroundColor: CORES.erroBg,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  erroTexto: {
    color: CORES.erro,
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  botao: {
    backgroundColor: CORES.primario,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  botaoDisabled: {
    opacity: 0.7,
  },
  botaoTexto: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});