import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { API_BASE, Door, canBypassLocks } from '../api';
import { ScreenProps } from '../navigation';
import { useUser } from '../hooks/useUser';
import UserHeader from '../components/UserHeader';
import { colors, common } from '../theme';

type LabelInfo = {
  jobNumber: string;
  doorPartNumber: string;
  idOk: string;
  part: 'DOOR' | 'FRAME';
  stageKey: string | null;
  stageTitle: string | null;
  // The checklist above was rejected by the final review: fix it first.
  needsFix?: boolean;
  // All measures of this piece are saved: skip the measures screen.
  measuresComplete: boolean;
  // Door Room Hanger / Foreman / admin (decided by the server).
  canReview?: boolean;
  // For them: the Door Hanger checklist and what is missing before it.
  hanger?: {
    stageKey: string;
    partKey: string;
    ready: boolean; // Build, Molding and Trim (door and frame) saved and passed
    missing: string[];
    saved: boolean;
    doorDone: boolean;
  } | null;
  // La pieza escaneada se mandó a reorden y nadie ha confirmado la nueva.
  openReorder?: { defect: string | null; at: string; approvedByName: string | null } | null;
};

const ACCENT = '#e8201e';
// Scan guides, same look as the MoldSchedule scanner.
const SCAN_RED = '#ff0000';
const CORNER = 40;
const STROKE = 6;
const INSET = 16;
const LINE_MARGIN = 12;
const SWEEP_MS = 1800;

// If the camera native module is not in this APK, the app must not break:
// the screen says so and the job can still be searched by hand.
let Camera: any = null;
let CameraType: any = { Back: 1 };
try {
  const cameraKit = require('react-native-camera-kit');
  Camera = cameraKit?.Camera ?? null;
  CameraType = cameraKit?.CameraType ?? CameraType;
} catch (error) {
  console.error('Camera module not available:', error);
}

async function requestCamera(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

// Start screen. Flow: scan the label -> ask whether the job paperwork was
// received (only asked when it is not in yet) -> open the first pending
// checklist of that door (DOOR) or frame (FRAME).
const ScanScreen: React.FC<ScreenProps<'Scan'>> = ({ navigation }) => {
  const user = useUser();
  const [hasCamera, setHasCamera] = useState<boolean | null>(null);
  const cameraReady = !!Camera;
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [scanKey, setScanKey] = useState(0);
  const lastCode = useRef<string | null>(null);

  // The red line sweeps up and down while the camera looks for a code.
  const [targetHeight, setTargetHeight] = useState(0);
  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!hasCamera || !cameraReady || targetHeight === 0) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, {
          toValue: 1,
          duration: SWEEP_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(sweep, {
          toValue: 0,
          duration: SWEEP_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [hasCamera, cameraReady, targetHeight, sweep]);
  const lineTranslate = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: [LINE_MARGIN, Math.max(targetHeight - LINE_MARGIN, LINE_MARGIN)],
  });

  useEffect(() => {
    requestCamera().then(setHasCamera);
  }, []);

  // Back from a checklist: the camera reads again.
  useFocusEffect(
    useCallback(() => {
      busyRef.current = false;
      setBusy(false);
      lastCode.current = null;
      setScanKey((k) => k + 1);
    }, []),
  );

  const setBusyBoth = (value: boolean) => {
    busyRef.current = value;
    setBusy(value);
  };

  const resume = () => {
    setBusyBoth(false);
    lastCode.current = null;
    setScanKey((k) => k + 1);
  };

  const readLabel = async (code: string) => {
    const response = await fetch(
      `${API_BASE}/label?code=${encodeURIComponent(code)}&user=${encodeURIComponent(user?.ID ?? '')}`,
    );
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, data };
  };

  const getPaperwork = async (jobNumber: string) => {
    const response = await fetch(`${API_BASE}/paperwork?jobNumber=${encodeURIComponent(jobNumber)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.paperwork ?? null;
  };

  const confirmPaperwork = async (jobNumber: string) => {
    const response = await fetch(`${API_BASE}/paperwork`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobNumber, userID: user?.ID ?? '' }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.error || 'Unknown error');
  };

  // Door Room Hanger / Foreman / admin go to the Door Hanger checklist;
  // everyone else to the next checklist of the scanned door or frame.
  const openPiece = async (label: LabelInfo) => {
    if (label.canReview && label.hanger) {
      await openHanger(label);
      return;
    }
    await openChecklist(label);
  };

  const pieceName = (label: LabelInfo) =>
    label.part === 'FRAME'
      ? `Frame ${label.doorPartNumber.replace('D', 'J')}`
      : `Door ${label.doorPartNumber}`;

  // The scanned door, as the door lists have it.
  const findDoor = async (label: LabelInfo): Promise<Door | undefined> => {
    const response = await fetch(
      `${API_BASE}/doors?jobNumber=${encodeURIComponent(label.jobNumber)}&user=${encodeURIComponent(
        user?.ID ?? '',
      )}`,
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return (data.doors || []).find((d: Door) => d.idOk === label.idOk) as Door | undefined;
  };

  // Reviewers: the Door Hanger checklist, the same from the door or the frame
  // label — only once Build, Molding and Trim (door and frame) are saved and
  // passed. Otherwise it says which checklists are still missing.
  const openHanger = async (label: LabelInfo) => {
    const h = label.hanger;
    if (!h) return;
    const doorText = `Door ${label.doorPartNumber} of job ${label.jobNumber}`;
    if (h.doorDone) {
      Alert.alert('Door completed', `${doorText} is completed. Every checklist is approved.`, [
        { text: 'OK', onPress: resume },
      ]);
      return;
    }
    if (!h.ready) {
      Alert.alert(
        'Door Hanger checklist not available',
        `Your Door Hanger checklist for ${doorText} cannot be answered yet. ` +
          `The following checklists must be completed first:\n\n• ${h.missing.join('\n• ')}`,
        [{ text: 'OK', onPress: resume }],
      );
      return;
    }
    const door = await findDoor(label);
    if (!door) {
      Alert.alert('Error', `Could not open ${pieceName(label)}.`, [{ text: 'OK', onPress: resume }]);
      return;
    }
    navigation.navigate('PartChecklist', { door, stageKey: h.stageKey, partKey: h.partKey });
    resume();
  };

  // Opens the first pending checklist of the scanned door or frame (a
  // checklist rejected by the final review comes first).
  const openChecklist = async (label: LabelInfo) => {
    const piece = pieceName(label);
    if (!label.stageKey) {
      Alert.alert('Nothing pending', `${piece} of job ${label.jobNumber} has no open checklist.`, [
        { text: 'OK', onPress: resume },
      ]);
      return;
    }
    const door = await findDoor(label);
    if (!door) {
      Alert.alert('Error', `Could not open ${piece}.`, [{ text: 'OK', onPress: resume }]);
      return;
    }
    // Primero las medidas del frame o de la door (si faltan); después el
    // checklist. Una corrección va directo al checklist.
    if (label.measuresComplete || label.needsFix) {
      navigation.navigate('PartChecklist', { door, stageKey: label.stageKey, partKey: label.part });
    } else {
      navigation.navigate('PieceMeasures', { door, stageKey: label.stageKey, partKey: label.part });
    }
    resume();
  };

  // Asks whether the job paperwork arrived. The checklist opens only after
  // the user confirms it.
  const askPaperwork = (code: string, jobNumber: string) => {
    // Master users (canBypassLocks) open the checklist even when the paperwork is not in.
    const bypass = canBypassLocks(user);
    const openAnyway = async () => {
      try {
        const fresh = await readLabel(code);
        if (!fresh.ok) throw new Error(fresh.data.error || 'Could not read the label');
        await openPiece(fresh.data as LabelInfo);
      } catch (error) {
        console.error('Error opening checklist:', error);
        Alert.alert('Error', 'Could not open the checklist. Check your connection.', [
          { text: 'OK', onPress: resume },
        ]);
      }
    };
    Alert.alert('Paperwork', `Has the paperwork for job ${jobNumber} been received?`, [
      { text: 'Not yet', style: 'cancel', onPress: bypass ? openAnyway : resume },
      {
        text: 'Yes, received',
        onPress: async () => {
          try {
            await confirmPaperwork(jobNumber);
            // The label answer depends on the paperwork, so it is read again.
            const fresh = await readLabel(code);
            if (!fresh.ok) throw new Error(fresh.data.error || 'Could not read the label');
            await openPiece(fresh.data as LabelInfo);
          } catch (error) {
            console.error('Error confirming paperwork:', error);
            Alert.alert(
              'Error',
              `Could not confirm the paperwork. ${error instanceof Error ? error.message : ''}`,
              [{ text: 'OK', onPress: resume }],
            );
          }
        },
      },
    ]);
  };

  // Paperwork (si falta) y luego el checklist de la pieza.
  const proceed = async (code: string, label: LabelInfo) => {
    const paperwork = await getPaperwork(label.jobNumber);
    if (!paperwork) {
      askPaperwork(code, label.jobNumber);
      return;
    }
    await openPiece(label);
  };

  // La pieza estaba en REORDER: ¿es la pieza nueva? Sí cierra la reorden
  // (api-mobile/doors/reorder/receive) y sigue a su checklist desde el
  // principio; No deja la pieza como está.
  const askNewPiece = (code: string, label: LabelInfo) => {
    const r = label.openReorder;
    if (!r) return;
    const piece = pieceName(label);
    const when = new Date(r.at).toLocaleDateString();
    Alert.alert(
      'Piece in REORDER',
      `${piece} of job ${label.jobNumber} was sent to REORDER on ${when}` +
        (r.defect ? ` (${r.defect})` : '') +
        `.\n\nIs this the NEW piece? Its checklists start from the beginning.`,
      [
        { text: 'No', style: 'cancel', onPress: resume },
        {
          text: 'Yes, new piece',
          onPress: async () => {
            try {
              const response = await fetch(`${API_BASE}/reorder/receive`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ door: label.idOk, part: label.part, userID: user?.ID ?? '' }),
              });
              const data = await response.json().catch(() => ({}));
              if (!response.ok || !data.success) throw new Error(data.error || 'Unknown error');
              await proceed(code, { ...label, openReorder: null });
            } catch (error) {
              Alert.alert(
                'Error',
                `Could not confirm the new piece. ${error instanceof Error ? error.message : ''}`,
                [{ text: 'OK', onPress: resume }],
              );
            }
          },
        },
      ],
    );
  };

  const handleCode = async (raw: string) => {
    const code = raw.trim();
    if (busyRef.current || !code || code === lastCode.current) return;
    lastCode.current = code;
    setBusyBoth(true);
    try {
      const { ok, data } = await readLabel(code);
      if (!ok) {
        Alert.alert('Label not recognized', data.error || 'This label could not be read.', [
          { text: 'OK', onPress: resume },
        ]);
        return;
      }
      const label = data as LabelInfo;
      if (label.openReorder) {
        askNewPiece(code, label);
        return;
      }
      await proceed(code, label);
    } catch (error) {
      console.error('Error reading label:', error);
      Alert.alert('Error', 'Could not read the label. Check your connection.', [
        { text: 'OK', onPress: resume },
      ]);
    }
  };

  // Back solo si hay a dónde regresar (el menú de los revisores).
  const header = (
    <UserHeader
      title="Doors Checklist"
      onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
    />
  );

  if (hasCamera === null) {
    return (
      <View style={common.container}>
        {header}
        <Text style={common.loadingText}>Preparing camera...</Text>
      </View>
    );
  }

  return (
    <View style={common.container}>
      {header}

      <View style={styles.body}>
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>Scan label</Text>
          <Text style={styles.sectionSubtitle}>Point the camera at the door or frame label</Text>
        </View>

        <View style={styles.scanArea}>
          {hasCamera && cameraReady ? (
            <Camera
              key={scanKey}
              style={StyleSheet.absoluteFill}
              cameraType={CameraType.Back}
              scanBarcode
              showFrame={false}
              onReadCode={(event: { nativeEvent: { codeStringValue: string } }) =>
                handleCode(event.nativeEvent.codeStringValue)
              }
            />
          ) : (
            <View style={styles.noCamera}>
              <Icon name="camera-outline" size={40} color="#fff" />
              <Text style={styles.noCameraText}>
                {cameraReady
                  ? 'The app needs the camera to scan labels.'
                  : 'The camera is not available in this version of the app. Search the job by hand.'}
              </Text>
              {cameraReady && (
                <Pressable
                  onPress={async () => setHasCamera(await requestCamera())}
                  style={styles.button}
                >
                  <Text style={styles.buttonText}>Allow camera</Text>
                </Pressable>
              )}
            </View>
          )}
          {hasCamera && cameraReady && busy && (
            <View style={styles.busy}>
              <Text style={styles.busyText}>Searching...</Text>
            </View>
          )}
        {hasCamera && cameraReady && (
          <>
            <View
              style={styles.target}
              pointerEvents="none"
              onLayout={(event) => setTargetHeight(event.nativeEvent.layout.height)}
            >
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
              <Animated.View style={[styles.line, { transform: [{ translateY: lineTranslate }] }]} />
            </View>
            {!busy && (
              <Text style={styles.hint} pointerEvents="none">
                Point the camera at the door or frame label
              </Text>
            )}
          </>
        )}
        </View>

        {/* Solo Admin / Foreman / Door Room Hanger (canReview del login) y 1529.
            TEMPORAL: 0559 también, para probar los modales de aprobación sin
            poder escanear labels. Quitar cuando terminen las pruebas. */}
        {(user?.canReview || canBypassLocks(user) || Number(user?.ID) === 559) && (
          <Pressable
            onPress={() => navigation.navigate('Jobs')}
            style={({ pressed }) => [styles.manual, pressed && styles.pressed]}
          >
            <Icon name="search" size={16} color={colors.navy} />
            <Text style={styles.manualText}>Search job manually</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  body: { flex: 1, padding: 16, gap: 16 },
  sectionBox: { gap: 2 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: colors.ink },
  sectionSubtitle: { fontSize: 13, color: colors.muted },
  scanArea: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: '#000',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noCamera: { alignItems: 'center', gap: 12, paddingHorizontal: 28 },
  noCameraText: { color: '#fff', fontSize: 16, textAlign: 'center' },
  button: { backgroundColor: ACCENT, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  busy: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
  },
  busyText: { color: '#fff', fontWeight: '600' },
  manual: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  manualText: { color: colors.navy, fontWeight: '600', fontSize: 15 },
  pressed: { opacity: 0.7 },
  // overflow hidden: the sweeping line can never be drawn outside the red frame.
  target: { 
    position: 'absolute', 
    top: INSET, 
    bottom: INSET, 
    left: INSET, 
    right: INSET, 
    overflow: 'hidden' 
  },
  corner: { 
    position: 'absolute', 
    width: CORNER, 
    height: CORNER, 
    borderColor: SCAN_RED 
  },
  topLeft: { 
    top: 0, 
    left: 0, 
    borderTopWidth: STROKE, 
    borderLeftWidth: STROKE, 
    borderTopLeftRadius: 12 
  },
  topRight: { 
    top: 0, 
    right: 0, 
    borderTopWidth: STROKE, 
    borderRightWidth: STROKE, 
    borderTopRightRadius: 12 
  },
  bottomLeft: { 
    bottom: 0, 
    left: 0, 
    borderBottomWidth: STROKE, 
    borderLeftWidth: STROKE, 
    borderBottomLeftRadius: 12 
  },
  bottomRight: { 
    bottom: 0, 
    right: 0, 
    borderBottomWidth: STROKE, 
    borderRightWidth: STROKE, 
    borderBottomRightRadius: 12 
  },
  line: { 
    position: 'absolute', 
    left: 10, 
    right: 10, 
    top: 0, 
    height: 5, 
    borderRadius: 2, 
    backgroundColor: SCAN_RED 
  },
  hint: {
    position: 'absolute',
    bottom: 15,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 4,
  },
});

export default ScanScreen;
