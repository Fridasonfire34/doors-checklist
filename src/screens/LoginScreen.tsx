import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Ionicons';
import { API_BASE } from '../api';
import { ScreenProps } from '../navigation';
import { colors } from '../theme';

// Mismo diseño que el login de MoldSchedule-mobile: código de 4 dígitos
// (la contraseña del usuario en [Users]) en un teclado numérico a todo lo
// ancho. Entra solo al teclear el 4º dígito, o con la flecha.
const CODE_LENGTH = 4;
const KEYS = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  'delete',
  '0',
  'enter',
];

const LoginScreen: React.FC<ScreenProps<'Login'>> = ({ navigation }) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (fullCode: string) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: fullCode }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        await AsyncStorage.setItem(
          'user',
          JSON.stringify({
            ID: String(data.user.id),
            Name: data.user.name,
            Type: data.user.type,
            canReview: !!data.user.canReview,
          }),
        );
        setCode('');
        // reset (no navigate) para que "atrás" no regrese al login. Todos
        // entran directo al scan.
        navigation.reset({
          index: 0,
          routes: [{ name: 'Scan' }],
        });
        return;
      }
      setError(
        response.status === 409
          ? data.error ?? 'Ask your supervisor for a new code.'
          : response.status === 401 || response.status === 400
          ? 'Wrong code. Try again.'
          : 'Server error. Try again in a moment.',
      );
    } catch (e) {
      console.error('Error logging in:', e);
      setError('No connection to the server. Check the Wi-Fi.');
    } finally {
      setLoading(false);
    }
    setCode('');
  };

  const press = (key: string) => {
    if (loading) return;
    setError('');
    if (key === 'delete') {
      setCode(prev => prev.slice(0, -1));
      return;
    }
    if (key === 'enter') {
      if (code) submit(code);
      return;
    }
    if (code.length >= CODE_LENGTH) return;
    const next = code + key;
    setCode(next);
    if (next.length === CODE_LENGTH) submit(next);
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <View style={styles.top}>
        <Image
          style={styles.logo}
          source={require('../assets/images/Tafco-logo.png')}
          resizeMode="contain"
        />
        <Text style={styles.title}>Doors Checklist</Text>
      </View>

      <View style={styles.middle}>
        <Text style={styles.prompt}>Enter your code</Text>

        <View style={[styles.codeBox, code !== '' && styles.codeBoxFilled]}>
          <Text style={[styles.codeText, !code && styles.codePlaceholder]}>
            {code ? '•'.repeat(code.length) : 'Code'}
          </Text>
        </View>

        <View style={styles.status}>
          {loading ? (
            <ActivityIndicator color={colors.navy} size="large" />
          ) : error ? (
            <View style={styles.errorBox}>
              <Icon name="alert-circle" size={18} color={colors.red} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.keypad}>
        {KEYS.map(key => (
          <Pressable
            key={key}
            onPress={() => press(key)}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={
              key === 'delete' ? 'Delete' : key === 'enter' ? 'Enter' : key
            }
            style={({ pressed }) => [
              styles.key,
              key === 'enter' && styles.keyEnter,
              key === 'enter' && !code && styles.keyDisabled,
              pressed && styles.keyPressed,
            ]}
          >
            {key === 'delete' ? (
              <Icon name="backspace-outline" size={28} color={colors.navy} />
            ) : key === 'enter' ? (
              <Icon name="arrow-forward" size={30} color="#fff" />
            ) : (
              <Text style={styles.keyText}>{key}</Text>
            )}
          </Pressable>
        ))}
      </View>

      <View style={styles.footer}>
        <Icon name="help-circle-outline" size={14} color="#9aa1ac" />
        <Text style={styles.footerText}>
          Forgot your code? Ask your supervisor.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },
  top: {
    alignItems: 'center',
    paddingTop: 48,
  },
  logo: {
    width: 200,
    height: 84,
  },
  title: {
    marginTop: 14,
    fontSize: 24,
    color: colors.navy,
    fontFamily: 'LibreBaskerville-Regular',
  },
  middle: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  prompt: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.navy,
  },
  codeBox: {
    minWidth: 220,
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderBottomWidth: 2,
    borderBottomColor: colors.border,
    alignItems: 'center',
  },
  codeBoxFilled: {
    borderBottomColor: colors.navy,
  },
  codeText: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 6,
    color: colors.navy,
  },
  codePlaceholder: {
    color: colors.border,
  },
  status: {
    minHeight: 56,
    justifyContent: 'center',
    marginTop: 12,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.redBg,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  errorText: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.red,
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
    paddingHorizontal: 28,
  },
  key: {
    width: '31%',
    height: 64,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyEnter: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  keyDisabled: {
    opacity: 0.4,
  },
  keyPressed: {
    backgroundColor: colors.navySoft,
    borderColor: colors.navy,
  },
  keyText: {
    fontSize: 26,
    fontWeight: '600',
    color: colors.navy,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 22,
  },
  footerText: {
    fontSize: 12,
    color: '#9aa1ac',
  },
});

export default LoginScreen;
