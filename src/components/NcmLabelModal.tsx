import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  LayoutChangeEvent,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { MOLDS_API_BASE } from '../api';
import { colors, common } from '../theme';

// Label NCM (Non Conforming Material) de una pieza mandada a reorden: el
// mismo label de 6" x 2" que imprime MoldSchedule-mobile en Repairs
// (LabelPreview + useLabelPrint). Se imprime con las rutas de MoldSchedule en
// el mismo servidor: cleaning/label-printers y cleaning/print-label.

export type NcmLabel = {
  jobNumber: string;
  partNumber: string; // D01 (door) / J01 (frame)
  initials: string;
  defect: string; // "Shallow groove, Soft foam"
};

type ServerPrinter = { name: string; online: boolean | null };

// Igual que en MoldSchedule-mobile (LabelPreview.initialsOf).
const INITIALS_OVERRIDES: Record<string, string> = {
  'amy livergood': 'A.D.L',
};
export const initialsOf = (name: string) => {
  const words = name.split(/\s+/).filter(Boolean);
  return (
    INITIALS_OVERRIDES[words.join(' ').toLowerCase()] ??
    words
      .slice(0, 3)
      .map(word => word[0].toUpperCase())
      .join('.')
  );
};

const LABEL_W_IN = 6;
const LABEL_H_IN = 2;
const SAFE_MARGIN_IN = 0.2;
const NCM = { border: '#EF6C00', text: '#E65100' };

// Vista previa a escala (todo en pulgadas del label), igual que la de
// MoldSchedule: Job / Part / Initials, el recuadro NCM y los defectos.
const LabelPreview: React.FC<{ label: NcmLabel }> = ({ label }) => {
  const [inch, setInch] = useState(0);
  const px = (inches: number) => inches * inch;
  const defects = label.defect.split(', ').map(d => d.trim()).filter(Boolean);
  const caption = [styles.caption, { fontSize: px(0.11) }];
  const value = [styles.value, { fontSize: px(0.23), marginBottom: px(0.03) }];

  return (
    <View
      style={styles.label}
      onLayout={(e: LayoutChangeEvent) => setInch(e.nativeEvent.layout.width / LABEL_W_IN)}
    >
      {inch > 0 && (
        <View style={[styles.content, { margin: px(SAFE_MARGIN_IN), gap: px(0.18) }]}>
          <View style={{ width: px(1.75), paddingLeft: px(0.1) }}>
            <Text style={caption}>JOB NUMBER:</Text>
            <Text style={value} numberOfLines={1} adjustsFontSizeToFit>
              {label.jobNumber}
            </Text>
            <Text style={caption}>PART NUMBER:</Text>
            <Text style={value} numberOfLines={1}>
              {label.partNumber}
            </Text>
            <View style={[styles.row, { gap: px(0.05) }]}>
              <Text style={caption}>INITIALS:</Text>
              <Text style={[styles.value, { fontSize: px(0.23) }]}>{label.initials}</Text>
            </View>
          </View>

          <View
            style={[
              styles.status,
              {
                width: px(1.9),
                height: px(0.9),
                borderRadius: px(0.12),
                borderWidth: Math.max(1.5, px(0.03)),
                borderColor: NCM.border,
              },
            ]}
          >
            <Text style={[styles.statusText, { fontSize: px(0.33) }]} numberOfLines={1}>
              NCM
            </Text>
            <Text
              style={[styles.statusText, { fontSize: px(0.1), marginTop: px(0.03) }]}
              numberOfLines={1}
            >
              (NON CONFORMING MATERIAL)
            </Text>
          </View>

          <View style={styles.defects}>
            {defects.length > 0 && (
              <>
                <Text style={[styles.defectsTitle, { fontSize: px(0.12), marginBottom: px(0.06) }]}>
                  DEFECTS:
                </Text>
                {defects.map(item => (
                  <View key={item} style={[styles.row, { marginBottom: px(0.02) }]}>
                    <Text style={[styles.defectText, { fontSize: px(0.125), width: px(0.17) }]}>•</Text>
                    <Text style={[styles.defectText, styles.flex, { fontSize: px(0.125) }]}>{item}</Text>
                  </View>
                ))}
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
};

// Al aprobar la reorden: preview del label y Print label (elige impresora).
// Done cierra (la pieza ya quedó en reorden aunque no se imprima).
const NcmLabelModal: React.FC<{
  label: NcmLabel | null;
  title: string;
  doneText?: string;
  onDone: () => void;
}> = ({ label, title, doneText = 'Done', onDone }) => {
  // null = no se está eligiendo impresora; [] cargando la lista.
  const [printers, setPrinters] = useState<ServerPrinter[] | null>(null);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [printingOn, setPrintingOn] = useState<string | null>(null);
  const [printedOn, setPrintedOn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPrinters(null);
    setPrintedOn(null);
    setError(null);
  }, [label]);

  if (!label) return null;

  const pickPrinter = async () => {
    setError(null);
    setPrinters([]);
    setLoadingPrinters(true);
    try {
      const response = await fetch(`${MOLDS_API_BASE}/cleaning/label-printers`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setPrinters(data.printers ?? []);
    } catch {
      setPrinters(null);
      setError('Could not get the printers from the server. Check the Wi-Fi and try again.');
    } finally {
      setLoadingPrinters(false);
    }
  };

  const printOn = async (printer: string) => {
    setError(null);
    setPrintingOn(printer);
    try {
      const response = await fetch(`${MOLDS_API_BASE}/cleaning/print-label`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobNumber: label.jobNumber,
          partNumber: label.partNumber,
          initials: label.initials,
          good: false,
          ncm: true,
          defect: label.defect,
          printer,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          data?.reason === 'PRINTER_NOT_FOUND'
            ? `Printer not found: ${data.printer}. Ask the supervisor.`
            : 'Could not print the label. Try again.',
        );
      }
      setPrintedOn(data.printer ?? printer);
      setPrinters(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not print the label. Try again.');
    } finally {
      setPrintingOn(null);
    }
  };

  // Disponibles primero, luego desconocidas, luego apagadas.
  const rank = (p: ServerPrinter) => (p.online === true ? 0 : p.online === null ? 1 : 2);
  const sorted = [...(printers ?? [])].sort(
    (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name),
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <ScrollView contentContainerStyle={styles.center} showsVerticalScrollIndicator={false}>
          <View style={styles.box}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>NCM label · 6" × 2"</Text>
            <LabelPreview label={label} />

            {printedOn && (
              <View style={styles.printedNote}>
                <Icon name="checkmark-circle" size={20} color={colors.green} />
                <Text style={styles.printedText}>Label sent to {printedOn}</Text>
              </View>
            )}
            {error && <Text style={styles.error}>{error}</Text>}

            {printers !== null ? (
              // Elegir impresora (las del servidor, como en MoldSchedule).
              <View style={styles.printers}>
                <Text style={styles.pickTitle}>Pick the printer:</Text>
                {loadingPrinters && <ActivityIndicator color={colors.navy} style={styles.loading} />}
                {!loadingPrinters && sorted.length === 0 && (
                  <Text style={styles.empty}>No label printers found on the server.</Text>
                )}
                {sorted.map(printer => (
                  <Pressable
                    key={printer.name}
                    onPress={() => printOn(printer.name)}
                    disabled={printingOn !== null}
                    style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
                  >
                    <View
                      style={[
                        styles.dot,
                        printer.online === true && styles.dotOn,
                        printer.online === false && styles.dotOff,
                      ]}
                    />
                    <View style={styles.flex}>
                      <Text style={styles.optionName}>{printer.name}</Text>
                      <Text style={styles.optionStatus}>
                        {printer.online === true
                          ? 'Available'
                          : printer.online === false
                          ? 'Off or not answering'
                          : 'Status unknown'}
                      </Text>
                    </View>
                    {printingOn === printer.name ? (
                      <ActivityIndicator color={colors.navy} />
                    ) : (
                      <Icon name="chevron-forward" size={20} color={colors.placeholder} />
                    )}
                  </Pressable>
                ))}
                <TouchableOpacity
                  style={[common.navBtn, styles.stacked, printingOn !== null && common.disabled]}
                  disabled={printingOn !== null}
                  onPress={() => setPrinters(null)}
                >
                  <Text style={common.navBtnText}>Back</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <TouchableOpacity
                  style={[printedOn ? common.navBtn : common.primaryBtn, styles.stacked]}
                  onPress={pickPrinter}
                >
                  <Text style={printedOn ? common.navBtnText : common.primaryBtnText}>
                    {printedOn ? 'Print again' : 'Print label'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[printedOn ? common.primaryBtn : common.navBtn, styles.stacked]}
                  onPress={onDone}
                >
                  <Text style={printedOn ? common.primaryBtnText : common.navBtnText}>{doneText}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  center: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  box: { backgroundColor: '#fff', borderRadius: 16, padding: 18, gap: 12 },
  title: { fontSize: 18, fontWeight: '700', color: colors.navy, textAlign: 'center' },
  subtitle: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: -6 },
  // primaryBtn / navBtn traen flex: 1 (pensados para filas).
  stacked: { flex: 0 },
  label: {
    width: '100%',
    aspectRatio: LABEL_W_IN / LABEL_H_IN,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#9AA3AE',
    borderRadius: 6,
    overflow: 'hidden',
  },
  content: { flex: 1, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  caption: { color: '#7A7A7A', fontWeight: '700' },
  value: { color: '#000', fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'baseline' },
  status: { alignItems: 'center', justifyContent: 'center' },
  statusText: { color: NCM.text, fontWeight: '700' },
  defects: { flex: 1 },
  defectsTitle: { color: '#000', fontWeight: '700' },
  defectText: { color: '#000' },
  flex: { flex: 1 },
  printedNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  printedText: { fontSize: 16, color: colors.green, fontWeight: '700' },
  error: { color: colors.red, textAlign: 'center', fontSize: 14 },
  printers: { gap: 8 },
  pickTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  loading: { paddingVertical: 12 },
  empty: { fontSize: 14, color: colors.muted, textAlign: 'center', paddingVertical: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 54,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
  },
  optionPressed: { backgroundColor: colors.navySoft },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.placeholder },
  dotOn: { backgroundColor: colors.green },
  dotOff: { backgroundColor: colors.redBorder },
  optionName: { fontSize: 16, fontWeight: '700', color: colors.ink },
  optionStatus: { fontSize: 13, color: colors.muted },
});

export default NcmLabelModal;
