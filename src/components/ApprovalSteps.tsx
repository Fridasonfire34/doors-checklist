import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import ApproverModal from './ApproverModal';
import { colors, common } from '../theme';

export type SummaryRow = { label: string; value: string };

// Aprobación en tres pasos (reorden, medidas, checklists):
//   1. NOTICE: "Approval required" (Cancel | <reviewText>). Opcional.
//   2. SUMMARY: lo que se va a aprobar (Cancel | <approveText>).
//   3. ID: ApproverModal con el ID de Admin / Foreman / Door Room Hanger.
// bypassID (usuario maestro 1529): en el paso 2 aprueba directo con su ID,
// sin teclear nada.
const ApprovalSteps: React.FC<{
  visible: boolean;
  notice?: string;
  reviewText?: string;
  summaryTitle: string;
  rows: SummaryRow[];
  cancelText?: string;
  approveText: string;
  approverMessage: string;
  bypassID?: string | null;
  onApprove: (approverID: string) => Promise<string | null>;
  onCancel: () => void;
}> = ({
  visible,
  notice,
  reviewText = 'Review',
  summaryTitle,
  rows,
  cancelText = 'Cancel',
  approveText,
  approverMessage,
  bypassID,
  onApprove,
  onCancel,
}) => {
  const [step, setStep] = useState<'NOTICE' | 'SUMMARY' | 'ID'>('NOTICE');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) setStep(notice ? 'NOTICE' : 'SUMMARY');
  }, [visible, notice]);

  const approve = async () => {
    if (!bypassID) {
      setStep('ID');
      return;
    }
    setBusy(true);
    try {
      await onApprove(bypassID);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
        visible={visible && step === 'NOTICE'}
        transparent
        animationType="fade"
        onRequestClose={onCancel}
      >
        <View style={styles.backdrop}>
          <View style={styles.box}>
            <Text style={styles.title}>Approval required</Text>
            <Text style={styles.message}>{notice}</Text>
            <View style={styles.row}>
              <TouchableOpacity style={common.navBtn} onPress={onCancel}>
                <Text style={common.navBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={common.primaryBtn} onPress={() => setStep('SUMMARY')}>
                <Text style={common.primaryBtnText}>{reviewText}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={visible && step === 'SUMMARY'}
        transparent
        animationType="fade"
        onRequestClose={onCancel}
      >
        <View style={styles.backdrop}>
          <View style={styles.box}>
            <Text style={styles.title}>{summaryTitle}</Text>
            <ScrollView style={styles.rows}>
              {rows.map(r => (
                <View key={r.label} style={styles.summaryRow}>
                  <Text style={styles.label}>{r.label}</Text>
                  <Text style={styles.value}>{r.value || '—'}</Text>
                </View>
              ))}
            </ScrollView>
            <View style={[styles.row, styles.buttons]}>
              <TouchableOpacity style={common.navBtn} onPress={onCancel} disabled={busy}>
                <Text style={common.navBtnText}>{cancelText}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[common.primaryBtn, busy && common.disabled]}
                onPress={approve}
                disabled={busy}
              >
                <Text style={common.primaryBtnText}>{busy ? 'Saving...' : approveText}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ApproverModal
        visible={visible && step === 'ID'}
        message={approverMessage}
        onSubmit={onApprove}
        onCancel={onCancel}
      />
    </>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  box: { backgroundColor: '#fff', borderRadius: 16, padding: 20, maxHeight: '85%' },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.navy,
    marginBottom: 16,
    textAlign: 'center',
  },
  message: { fontSize: 15, color: colors.ink, textAlign: 'center', marginBottom: 18 },
  row: { flexDirection: 'row', gap: 10 },
  rows: { flexGrow: 0 },
  summaryRow: { marginBottom: 12 },
  label: { fontSize: 13, color: colors.muted, marginBottom: 2 },
  value: { fontSize: 16, fontWeight: '600', color: colors.ink },
  buttons: { marginTop: 8 },
});

export default ApprovalSteps;
