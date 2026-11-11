import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { colors, common } from '../theme';

// ID de aprobación: 4 dígitos, con el mismo teclado que el login.
const APPROVER_LENGTH = 4;
const APPROVER_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'delete', '0', 'enter'];

// Modal que pide el ID de un Administrator / Foreman / Door Room Hanger
// (measures y checklists). Al 4º dígito llama onSubmit; si devuelve un
// mensaje (ID no permitido), lo muestra y limpia el código para reintentar.
const ApproverModal: React.FC<{
  visible: boolean;
  message: string;
  onSubmit: (approverID: string) => Promise<string | null>;
  onCancel: () => void;
}> = ({ visible, message, onSubmit, onCancel }) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setCode('');
      setError(null);
    }
  }, [visible]);

  const submit = async (value: string) => {
    setBusy(true);
    try {
      const failure = await onSubmit(value);
      if (failure) {
        setError(failure);
        setCode('');
      }
    } finally {
      setBusy(false);
    }
  };

  const press = (key: string) => {
    if (busy) return;
    setError(null);
    if (key === 'delete') {
      setCode((prev) => prev.slice(0, -1));
      return;
    }
    if (key === 'enter') {
      if (code.length === APPROVER_LENGTH) submit(code);
      return;
    }
    if (code.length >= APPROVER_LENGTH) return;
    const next = code + key;
    setCode(next);
    if (next.length === APPROVER_LENGTH) submit(next);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => !busy && onCancel()}
    >
      <View style={styles.backdrop}>
        <View style={styles.box}>
          <Text style={styles.title}>Approval required</Text>
          <Text style={styles.text}>{message}</Text>
          <View style={styles.codeBox}>
            {busy ? (
              <ActivityIndicator color={colors.navy} size="large" />
            ) : (
              <Text style={[styles.codeText, !code && styles.codePlaceholder]}>
                {code ? '•'.repeat(code.length) : '_ _ _ _'}
              </Text>
            )}
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.pad}>
            {APPROVER_KEYS.map((key) => (
              <Pressable
                key={key}
                onPress={() => press(key)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={key === 'delete' ? 'Delete' : key === 'enter' ? 'Approve' : key}
                style={({ pressed }) => [
                  styles.key,
                  key === 'enter' && styles.keyEnter,
                  key === 'enter' && code.length !== APPROVER_LENGTH && styles.keyDisabled,
                  pressed && styles.keyPressed,
                ]}
              >
                {key === 'delete' ? (
                  <Icon name="backspace-outline" size={26} color={colors.navy} />
                ) : key === 'enter' ? (
                  <Icon name="arrow-forward" size={28} color="#fff" />
                ) : (
                  <Text style={styles.keyText}>{key}</Text>
                )}
              </Pressable>
            ))}
          </View>
          <View style={styles.buttons}>
            <TouchableOpacity style={common.navBtn} onPress={onCancel} disabled={busy}>
              <Text style={common.navBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  box: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  title: { fontSize: 18, fontWeight: '700', color: colors.navy, marginBottom: 6 },
  text: { fontSize: 14, color: colors.muted, marginBottom: 14 },
  codeBox: {
    alignSelf: 'center',
    minWidth: 220,
    minHeight: 60,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderBottomWidth: 2,
    borderBottomColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeText: { fontSize: 34, fontWeight: '800', letterSpacing: 6, color: colors.navy },
  codePlaceholder: { color: colors.border },
  pad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
    marginTop: 8,
  },
  key: {
    width: '31%',
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyEnter: { backgroundColor: colors.navy, borderColor: colors.navy },
  keyPressed: { backgroundColor: colors.navySoft, borderColor: colors.navy },
  keyText: { fontSize: 24, fontWeight: '600', color: colors.navy },
  keyDisabled: { opacity: 0.4 },
  error: { color: '#c62828', fontSize: 13, marginBottom: 8, textAlign: 'center' },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 },
});

export default ApproverModal;
