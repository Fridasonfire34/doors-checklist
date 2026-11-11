import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { API_BASE, DefectType } from '../api';
import { colors, common } from '../theme';

export type ReorderReason = {
  // Door Hanger: las piezas elegidas (DOOR / FRAME). Molding: vacío (la
  // pieza es la del checklist).
  pieces: string[];
  defectTypeIds: number[];
  note: string;
  // Como sale en el label NCM: "Shallow groove, Other: <nota>".
  defect: string;
};

// "Why is it a reorder?": la misma lista de defectos de MoldSchedule
// ([Defect Types]). Se marcan todos los que tenga; "Other" pide escribir
// cuál. Continue sigue a la aprobación (ID de Admin / Foreman / Hanger).
const ReorderModal: React.FC<{
  visible: boolean;
  piece: string; // "Door D01" / "Frame J01" / "a piece of D01"
  // Desde Door Hanger (revisa las dos piezas) primero se elige cuál.
  pieces?: { key: string; label: string }[];
  onContinue: (reason: ReorderReason) => void;
  onCancel: () => void;
}> = ({ visible, piece, pieces, onContinue, onCancel }) => {
  const [types, setTypes] = useState<DefectType[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [note, setNote] = useState('');
  const [pickedPieces, setPickedPieces] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) return;
    setSelected([]);
    setNote('');
    setPickedPieces([]);
    if (types) return;
    setLoadError(false);
    fetch(`${API_BASE}/reorder`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(data => setTypes(data.defectTypes ?? []))
      .catch(() => setLoadError(true));
  }, [visible, types]);

  const picked = (types ?? []).filter(t => selected.includes(t.id));
  const needsNote = picked.some(t => t.requiresNote);
  const canContinue =
    picked.length > 0 &&
    (!needsNote || note.trim().length > 0) &&
    (!pieces || pickedPieces.length > 0);
  const togglePiece = (key: string) =>
    setPickedPieces(prev => (prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key]));

  const toggle = (id: number) =>
    setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const submit = () =>
    onContinue({
      pieces: pieces ? pickedPieces : [],
      defectTypeIds: selected,
      note: note.trim(),
      defect: picked
        .map(t => (t.requiresNote ? `${t.name}: ${note.trim()}` : t.name))
        .join(', '),
    });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.box}>
          <View style={styles.iconCircle}>
            <Icon name="refresh-circle" size={30} color={colors.red} />
          </View>
          <Text style={styles.title}>Send {piece} to reorder</Text>
          <Text style={styles.subtitle}>Why is it a reorder? Check every defect it has.</Text>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {pieces && (
              <>
                <Text style={styles.groupTitle}>Which piece?</Text>
                <View style={styles.piecesRow}>
                  {pieces.map(p => {
                    const active = pickedPieces.includes(p.key);
                    return (
                      <Pressable
                        key={p.key}
                        onPress={() => togglePiece(p.key)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: active }}
                        style={[styles.option, styles.pieceOption, active && styles.optionActive]}
                      >
                        <Icon
                          name={active ? 'checkbox' : 'square-outline'}
                          size={22}
                          color={active ? colors.red : colors.placeholder}
                        />
                        <Text style={[styles.optionText, active && styles.optionTextActive]}>
                          {p.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.groupTitle}>Defects</Text>
              </>
            )}
            {loadError ? (
              <Text style={styles.error}>Could not load the defect list. Check your connection.</Text>
            ) : !types ? (
              <ActivityIndicator color={colors.navy} style={styles.loading} />
            ) : (
              types.map(type => {
                const active = selected.includes(type.id);
                return (
                  <Pressable
                    key={type.id}
                    onPress={() => toggle(type.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: active }}
                    style={[styles.option, active && styles.optionActive]}
                  >
                    <Icon
                      name={active ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={active ? colors.red : colors.placeholder}
                    />
                    <Text style={[styles.optionText, active && styles.optionTextActive]}>
                      {type.requiresNote ? `${type.name} - specify below` : type.name}
                    </Text>
                  </Pressable>
                );
              })
            )}
            {needsNote && (
              <TextInput
                style={styles.note}
                value={note}
                onChangeText={setNote}
                placeholder="Describe the defect"
                placeholderTextColor={colors.placeholder}
                maxLength={100}
                autoFocus
              />
            )}
          </ScrollView>

          <View style={[common.navRow, styles.buttons]}>
            <TouchableOpacity style={common.navBtn} onPress={onCancel}>
              <Text style={common.navBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.reorderBtn, !canContinue && common.disabled]}
              disabled={!canContinue}
              onPress={submit}
            >
              <Text style={styles.reorderBtnText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  box: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    maxHeight: '92%',
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.redBg,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  title: {
    fontSize: 19,
    fontWeight: '700',
    color: colors.navy,
    textAlign: 'center',
    marginTop: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 10,
  },
  list: { flexGrow: 0 },
  listContent: { gap: 6, paddingBottom: 6 },
  loading: { marginVertical: 20 },
  groupTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  piecesRow: { flexDirection: 'row', gap: 8 },
  pieceOption: { flex: 1 },
  error: { color: colors.red, textAlign: 'center', marginVertical: 16 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
  },
  optionActive: {
    borderColor: colors.redBorder,
    backgroundColor: colors.redBg,
  },
  optionText: { flex: 1, fontSize: 16, color: colors.ink },
  optionTextActive: { fontWeight: '700' },
  note: {
    marginTop: 6,
    minHeight: 70,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.inputBg,
    padding: 10,
    fontSize: 15,
    color: colors.ink,
    textAlignVertical: 'top',
  },
  buttons: { padding: 0, paddingTop: 12, marginBottom: 0, borderTopWidth: 0 },
  reorderBtn: {
    flex: 1,
    backgroundColor: colors.red,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  reorderBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

export default ReorderModal;
