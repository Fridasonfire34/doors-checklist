import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
} from 'react-native';
import {
  API_BASE,
  Answer,
  CheckItem,
  NextChecklist,
  StageDetail,
  StagePart,
  canBypassLocks,
  doorName,
  parseInches,
} from '../api';

// 57.5 -> 57 1/2"  (al 1/16 más cercano)
const fmtInches = (value: number) => {
  const sixteenths = Math.round(value * 16);
  const whole = Math.floor(sixteenths / 16);
  let num = sixteenths % 16;
  let den = 16;
  while (num && num % 2 === 0) {
    num /= 2;
    den /= 2;
  }
  return `${whole}${num ? ` ${num}/${den}` : ''}"`;
};
import { ScreenProps, resetToStart } from '../navigation';
import { useUser } from '../hooks/useUser';
import Header from '../components/Header';
import Dropdown from '../components/Dropdown';
import ApprovalSteps from '../components/ApprovalSteps';
import ApproverModal from '../components/ApproverModal';
import ReorderModal, { ReorderReason } from '../components/ReorderModal';
import NcmLabelModal, { NcmLabel, initialsOf } from '../components/NcmLabelModal';
import { colors, common } from '../theme';

type Draft = Omit<Answer, 'result'> & { result: Answer['result'] | null };

const emptyDraft = (item: CheckItem): Draft => ({
  id: item.id,
  result: null,
  type:
    Array.isArray(item.type) && item.type.length === 1
      ? item.type[0]
      : item.prefill?.type ?? '',
  measurement: '',
  value: '',
  quantity: item.prefill?.quantity ?? '',
  inputs: {},
  comment: '',
});

// Mismas reglas que evaluateAnswers en tafco-main (lib/doorStages.ts); el
// servidor vuelve a revisar al guardar. Devuelve qué falta, o null.
function missingFor(item: CheckItem, d: Draft): string | null {
  if (item.field) return d.value?.trim() ? null : 'value';
  // Heat: cada input (Ohm, Length) obligatorio; el Ohm es un número.
  if (item.inputs) {
    const empty = item.inputs.find(input => {
      const v = d.inputs?.[input.id]?.trim() ?? '';
      return !v || (input.numeric && !Number.isFinite(Number(v)));
    });
    return empty ? empty.label : null;
  }
  if (!d.result && !item.noAnswer) return 'answer';
  if (d.result === 'NA') return null;
  if (item.noteOn && d.choice === item.noteOn && !d.comment?.trim())
    return 'the note (what is missing)';
  if (item.measurement && !d.measurement?.trim()) return 'measurement';
  if (item.type && !item.optionalType && !d.type?.trim()) return 'type';
  if (item.quantity && !/^[1-9]\d*$/.test(d.quantity?.trim() ?? ''))
    return 'quantity';
  return null;
}

function isFail(
  item: CheckItem,
  d: Draft,
  drafts: Record<string, Draft>,
): boolean {
  if (item.field) {
    if (!item.atLeast) return false;
    const value = parseFloat(d.value ?? '');
    const min = parseFloat(drafts[item.atLeast]?.value ?? '');
    return Number.isFinite(value) && Number.isFinite(min) && value < min;
  }
  return !item.noAnswer && d.result === 'NO';
}

// Un checklist (QC sheet) de una etapa: Door Build, Frame Trimmer, Molding...
// Las líneas vienen del servidor, agrupadas por sección como en la hoja.
const PartChecklistScreen: React.FC<ScreenProps<'PartChecklist'>> = ({
  navigation,
  route,
}) => {
  const { door, stageKey, partKey } = route.params;
  const user = useUser();
  const [part, setPart] = useState<StagePart | null>(null);
  const [stageTitle, setStageTitle] = useState('');
  // canEdit: el servidor deja editar (quien lo llenó, o una corrección).
  // editing: las respuestas están abiertas. Al guardar se congelan y abajo
  // quedan Edit (volver a abrirlas) y APPROVE (ID de Admin / Foreman / Hanger),
  // igual que los measures. Door Hanger (lo llena un reviewer) no se aprueba.
  const isHanger = partKey === 'HANGER';
  const [canEdit, setCanEdit] = useState(false);
  const [editing, setEditing] = useState(true);
  const [approverOpen, setApproverOpen] = useState(false);
  // APPROVE con puntos NO (allowNo): el foreman decide primero si lo aprueba
  // así o lo regresa a corregir; luego su ID. sendBack = regresar (TO FIX).
  const [decideOpen, setDecideOpen] = useState(false);
  const [sendBackMode, setSendBackMode] = useState(false);
  // SAVE abre este modal: para guardar hace falta la aprobación de un
  // Foreman / Door Room Hanger. "Review answers" guarda y congela las
  // respuestas (quedan Edit | APPROVE).
  const [confirmSave, setConfirmSave] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // Reorden (Door / Frame Molding): defecto -> aprobación -> label NCM.
  const [reorderOpen, setReorderOpen] = useState(false);
  const [reorderReason, setReorderReason] = useState<ReorderReason | null>(null);
  // Pasos después de elegir el defecto: NOTICE (aviso de aprobación) ->
  // SUMMARY (razón, job y pieza) -> ID (ApproverModal) -> label NCM.

  // Un label por pieza reordenada (desde Door Hanger pueden ser dos).
  const [ncmLabels, setNcmLabels] = useState<(NcmLabel & { piece: string })[]>([]);
  // Medida del door y tolerancia (+0 / -1/16") para Height / Width.
  const [size, setSize] = useState<StageDetail['size']>({
    hgt: null,
    width: null,
  });
  const [tolerance, setTolerance] = useState<StageDetail['tolerance']>({
    plus: 0,
    minus: 1 / 16,
  });
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Modal que aparece al pasar el checklist: { next } = lo que sigue, o null.
  // doorCompleted: el checklist del Hanger completó la puerta (todo aprobado).
  const [passed, setPassed] = useState<{
    next: NextChecklist;
    doorCompleted: boolean;
  } | null>(null);
  // Cambios sin guardar: al salir (Back, botón atrás, Log out) se pregunta
  // antes de descartarlos. El ref deja que el listener vea el valor actual.
  const [dirty, setDirtyState] = useState(false);
  const dirtyRef = useRef(false);
  const setDirty = (value: boolean) => {
    dirtyRef.current = value;
    setDirtyState(value);
  };

  useEffect(
    () =>
      navigation.addListener('beforeRemove', e => {
        if (!dirtyRef.current) return;
        e.preventDefault();
        Alert.alert(
          'Discard changes?',
          'You have unsaved answers in this checklist. If you leave now they will be lost.',
          [
            { text: 'Keep editing', style: 'cancel' },
            {
              text: 'Discard',
              style: 'destructive',
              onPress: () => {
                dirtyRef.current = false;
                navigation.dispatch(e.data.action);
              },
            },
          ],
        );
      }),
    [navigation],
  );

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const response = await fetch(
          `${API_BASE}/stage?door=${encodeURIComponent(
            door.idOk,
          )}&stage=${stageKey}&user=${encodeURIComponent(user.ID)}`,
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data: StageDetail = await response.json();
        const p = data.parts.find(x => x.key === partKey) ?? null;
        setPart(p);
        setStageTitle(data.stage.title);
        // FRAME is measured against the frame opening, DOOR against the door.
        const partSize = partKey === 'FRAME' ? data.frameSize : data.size;
        if (partSize) setSize(partSize);
        if (data.tolerance) setTolerance(data.tolerance);
        setCanEdit(data.editable && !!p?.canEdit);
        // Guardado = congelado; sin guardar o rechazado = abierto para llenar.
        setEditing(isHanger || !p?.saved || !!p?.correction);
        if (p) {
          const saved = new Map((p.saved?.answers ?? []).map(a => [a.id, a]));
          const next: Record<string, Draft> = {};
          p.items.forEach(item => {
            const a = saved.get(item.id);
            next[item.id] = a
              ? { ...emptyDraft(item), ...a }
              : emptyDraft(item);
          });
          setDrafts(next);
          setComment(p.saved?.comment ?? '');
        }
      } catch (e) {
        console.error('Error loading checklist:', e);
        Alert.alert(
          'Error',
          'Could not load the checklist. Check your connection.',
        );
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [door.idOk, stageKey, partKey, user, isHanger, reloadKey]);

  if (!user || loading || !part) {
    return (
      <View style={common.container}>
        <Header
          title="Loading..."
          backLabel="Back"
          onBack={() => navigation.goBack()}
        />
        {loading && (
          <ActivityIndicator
            size="large"
            color={colors.navy}
            style={styles.loader}
          />
        )}
      </View>
    );
  }

  const editable = canEdit && editing;
  const frozen = !isHanger && !editing && !!part.saved;
  const review = part.review ?? 'NOT_SAVED';

  const update = (id: string, change: Partial<Draft>) => {
    if (!dirty) setDirty(true);
    setDrafts(prev => ({ ...prev, [id]: { ...prev[id], ...change } }));
  };

  const answered = part.items.filter(
    item => !missingFor(item, drafts[item.id]),
  ).length;
  // NO en un punto allowNo ("Squared on each side?") no es FAILED: se guarda
  // marcado y el foreman decide al aprobar.
  const flaggedItems = part.items.filter(
    item => item.allowNo && drafts[item.id]?.result === 'NO',
  );
  const failed = part.items.filter(
    item => !item.allowNo && isFail(item, drafts[item.id], drafts),
  ).length;
  const allAnswered = answered === part.items.length;

  // SAVE: Door Hanger guarda directo; los demás ven primero el aviso de
  // aprobación (modal) y guardan con "Review answers".
  const requestSave = () => {
    const missing = part.items.find(item => missingFor(item, drafts[item.id]));
    if (missing) {
      Alert.alert(
        'Missing',
        `${missing.label}: missing ${missingFor(missing, drafts[missing.id])}.`,
      );
      return;
    }
    if (isHanger) handleSave();
    else setConfirmSave(true);
  };

  const handleSave = async () => {
    const missing = part.items.find(item => missingFor(item, drafts[item.id]));
    if (missing) {
      Alert.alert(
        'Missing',
        `${missing.label}: missing ${missingFor(missing, drafts[missing.id])}.`,
      );
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          door: door.idOk,
          stage: stageKey,
          part: partKey,
          userID: user.ID,
          userName: user.Name,
          comment,
          answers: part.items.map(item => ({
            ...drafts[item.id],
            result: drafts[item.id].result ?? 'YES',
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success)
        throw new Error(data?.error || 'Unknown error');

      setDirty(false);
      if (isHanger) {
        // Con este checklist la puerta quedó completa: directo a la pantalla
        // del Door Hanger de esta puerta para tomar las fotos (Back de ahí
        // regresa al scan).
        if (data.status === 'COMPLETE' && data.doorCompleted) {
          resetToStart(navigation, user, {
            name: 'Stage',
            params: { door, stageKey },
          });
          Alert.alert(
            'Door completed',
            `${doorName(door)} from Job: ${door.jobNumber} completed correctly.`,
          );
          return;
        }
        // Pasó pero la puerta no tiene fotos (obligatorias): Door Hanger queda
        // pendiente; a la misma pantalla para tomarlas. La puerta se completa
        // al subir la primera (si lo demás ya está aprobado).
        if (data.status === 'COMPLETE' && data.needsPhotos) {
          resetToStart(navigation, user, {
            name: 'Stage',
            params: { door, stageKey },
          });
          Alert.alert(
            'Photos required',
            'Door Hanger saved. Take the photos of the door (Photos): Door Hanger stays pending until they are uploaded.',
          );
          return;
        }
        if (data.status === 'COMPLETE') {
          setPassed({ next: data.next ?? null, doorCompleted: false });
          return;
        }
        Alert.alert(
          'Saved',
          `Saved with ${failed} failed point(s). Fix them and check again.`,
        );
        navigation.goBack();
        return;
      }
      // Las respuestas se congelan: Edit para cambiarlas, APPROVE para aprobar.
      if (data.status !== 'COMPLETE') {
        Alert.alert(
          'Saved',
          `Saved with ${failed} failed point(s). Press Edit to fix them before it can be approved.`,
        );
      }
      setEditing(false);
      setReloadKey(k => k + 1);
    } catch (e) {
      Alert.alert(
        'Error',
        `Unable to save. ${e instanceof Error ? e.message : ''}`,
      );
    } finally {
      setSaving(false);
    }
  };

  // APPROVE: el ID tecleado en el modal queda guardado como quien aprobó.
  // Devuelve el mensaje para el modal cuando ese ID no puede aprobar.
  const approve = async (approverID: string): Promise<string | null> => {
    try {
      const response = await fetch(`${API_BASE}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          door: door.idOk,
          userID: user.ID,
          approverID,
          result: 'APPROVED',
          checklists: [{ stage: stageKey, part: partKey }],
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        if (response.status === 403) {
          return data.error || 'That ID is not allowed to approve';
        }
        throw new Error(data.error || 'Unknown error');
      }
      setApproverOpen(false);
      setReloadKey(k => k + 1);
      setPassed({ next: data.next ?? null, doorCompleted: !!data.doorCompleted });
    } catch (e) {
      setApproverOpen(false);
      Alert.alert(
        'Error',
        `Unable to approve. ${e instanceof Error ? e.message : ''}`,
      );
    }
    return null;
  };

  // Send back to fix: el foreman regresa el checklist con los puntos NO
  // marcados TO FIX (review REJECTED); solo esos quedan abiertos.
  const sendBack = async (approverID: string): Promise<string | null> => {
    const comment = flaggedItems
      .map(item => {
        const note = drafts[item.id]?.comment?.trim();
        return `${item.label}: NO${note ? ` (${note})` : ''}`;
      })
      .join('\n');
    try {
      const response = await fetch(`${API_BASE}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          door: door.idOk,
          userID: user.ID,
          approverID,
          result: 'REJECTED',
          comment,
          checklists: [
            {
              stage: stageKey,
              part: partKey,
              items: flaggedItems.map(item => item.id),
            },
          ],
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        if (response.status === 403) {
          return data.error || 'That ID is not allowed to review';
        }
        throw new Error(data.error || 'Unknown error');
      }
      setApproverOpen(false);
      setSendBackMode(false);
      setReloadKey(k => k + 1);
      Alert.alert(
        'Sent back to fix',
        `${flaggedItems.length} point(s) marked TO FIX. Fix them and SAVE again.`,
      );
    } catch (e) {
      setApproverOpen(false);
      setSendBackMode(false);
      Alert.alert(
        'Error',
        `Unable to send it back. ${e instanceof Error ? e.message : ''}`,
      );
    }
    return null;
  };

  // Después de elegir en el modal de decisión: ID del foreman (1529 directo).
  const decide = (back: boolean) => {
    setDecideOpen(false);
    setSendBackMode(back);
    if (canBypassLocks(user)) {
      if (back) sendBack(user.ID);
      else approve(user.ID);
      return;
    }
    setApproverOpen(true);
  };

  // Reorden aprobada (ID de Admin / Foreman / Hanger; 1529 directo): el
  // servidor borra todo lo contestado de esta pieza (door o frame) y regresa
  // los datos del label NCM. Devuelve el mensaje del modal si el ID no puede.
  const sendReorder = async (
    approverID: string,
    reason: ReorderReason | null = reorderReason,
  ): Promise<string | null> => {
    if (!reason) return null;
    try {
      const response = await fetch(`${API_BASE}/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          door: door.idOk,
          stage: stageKey,
          part: partKey,
          userID: user.ID,
          approverID,
          pieces: reason.pieces,
          defectTypeIds: reason.defectTypeIds,
          note: reason.note,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        if (response.status === 403) {
          return data.error || 'That ID is not allowed to approve';
        }
        throw new Error(data.error || 'Unknown error');
      }
      setReorderReason(null);
      setDirty(false);
      const initials = initialsOf(user.Name ?? '');
      setNcmLabels(
        (data.labels ?? []).map(
          (l: { piece: string; jobNumber: string; partNumber: string; defect: string }) => ({
            ...l,
            initials,
          }),
        ),
      );
    } catch (e) {
      setReorderReason(null);
      Alert.alert(
        'Error',
        `Unable to send to reorder. ${e instanceof Error ? e.message : ''}`,
      );
    }
    return null;
  };

  // Cancelar la reorden en cualquier paso: el checklist queda para contestarse.
  const cancelReorder = () => setReorderReason(null);

  const frameName = `Frame ${(door.partNumber ?? '').replace(/^D/i, 'J')}`;
  const pieceName = isHanger
    ? `a piece of ${doorName(door)}`
    : partKey === 'FRAME'
    ? frameName
    : `Door ${doorName(door)}`;
  // Pieza(s) de la reorden para el resumen: desde Door Hanger las elegidas.
  const reorderPiecesText = isHanger
    ? (reorderReason?.pieces ?? [])
        .map(p => (p === 'FRAME' ? frameName : `Door ${doorName(door)}`))
        .join(' + ')
    : pieceName;
  const reorders = part.reorders ?? [];
  const lastReorder = reorders[reorders.length - 1];

  const reorderButton = (
    <TouchableOpacity
      style={[styles.reorderBtn, saving && common.disabled]}
      onPress={() => setReorderOpen(true)}
      disabled={saving}
    >
      <Text style={styles.reorderBtnText}>Reorder</Text>
    </TouchableOpacity>
  );

  // Edit: abre las respuestas guardadas. Cancel (editando) las regresa a como
  // estaban guardadas.
  const cancelEdit = () => {
    const revert = () => {
      setDirty(false);
      setEditing(false);
      setReloadKey(k => k + 1);
    };
    if (!dirty) return revert();
    Alert.alert('Discard changes?', 'Your changes to this checklist will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: revert },
    ]);
  };

  const chip = (
    label: string,
    active: boolean,
    tone: 'yes' | 'no' | 'na' | 'pick',
    onPress: () => void,
    enabled = editable,
  ) => (
    <TouchableOpacity
      key={label}
      style={[
        styles.chip,
        active && tone === 'yes' && styles.chipYes,
        active && tone === 'no' && styles.chipNo,
        active && tone === 'na' && styles.chipNa,
        active && tone === 'pick' && styles.chipPick,
      ]}
      onPress={onPress}
      disabled={!enabled}
    >
      <Text
        style={[
          styles.chipText,
          active && tone === 'yes' && common.ok,
          active && tone === 'no' && common.fail,
          active && tone === 'pick' && styles.chipPickText,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  // Every point is required and answered in order: a point opens only once
  // all the ones before it are complete (answer, measurement, type).
  const firstMissing = (() => {
    const i = part.items.findIndex(it => missingFor(it, drafts[it.id]));
    return i === -1 ? part.items.length : i;
  })();

  const renderItem = (item: CheckItem) => {
    const d = drafts[item.id];
    // Rechazado por la revisión final: solo se editan los puntos marcados.
    const marked = !!part.correction?.items.includes(item.id);
    const open =
      editable &&
      (part.correction ? marked : part.items.indexOf(item) <= firstMissing);
    const chipFor = (
      label: string,
      active: boolean,
      tone: 'yes' | 'no' | 'na' | 'pick',
      onPress: () => void,
    ) => chip(label, active, tone, onPress, open);
    const fail = isFail(item, d, drafts);
    const toggle = (result: Answer['result'], choice?: string) =>
      update(
        item.id,
        d.result === result && d.choice === choice
          ? { result: null, choice: undefined }
          : {
              result,
              choice,
              // Al dejar la opción con nota (YES -> NO) se borra lo escrito.
              ...(item.noteOn && choice !== item.noteOn ? { comment: '' } : {}),
            },
      );

    const reference = item.ref ? size[item.ref] : null;
    if (item.ref && reference !== null) {
      const value = parseInches(d.measurement);
      const ok =
        value !== null &&
        value <= reference + tolerance.plus + 1e-6 &&
        value >= reference - tolerance.minus - 1e-6;
      const typed = !!d.measurement?.trim();
      return (
        <View
          key={item.id}
          style={[styles.itemBlock, editable && !open && styles.itemLocked]}
        >
          <View style={styles.itemTopRow}>
            <Text style={[styles.itemLabel, typed && !ok && common.fail]}>
              {item.label}
            </Text>
            <TextInput
              style={[
                styles.subFieldInput,
                styles.measureInput,
                typed && (ok ? styles.inputOk : styles.inputError),
              ]}
              value={d.measurement}
              editable={open}
              // Teclado numérico (sin "/"): la medida va en decimal, abajo
              // se ve su fracción para confirmar.
              keyboardType="decimal-pad"
              onChangeText={t => {
                const v = parseInches(t);
                const pass =
                  v !== null &&
                  v <= reference + tolerance.plus + 1e-6 &&
                  v >= reference - tolerance.minus - 1e-6;
                update(item.id, {
                  measurement: t,
                  result: v === null ? null : pass ? 'YES' : 'NO',
                });
              }}
              placeholder="Measure"
              placeholderTextColor={colors.placeholder}
            />
          </View>
          {value !== null && !Number.isInteger(value) && (
            <Text style={styles.measureHint}>= {fmtInches(value)}</Text>
          )}
          {(typed && !ok) || !!d.comment ? (
            <TextInput
              style={styles.noteInput}
              value={d.comment}
              editable={open}
              multiline
              onChangeText={t => update(item.id, { comment: t })}
              placeholder="Note: what is wrong?"
              placeholderTextColor={colors.placeholder}
            />
          ) : null}
        </View>
      );
    }

    // Heat: sin YES / N/A, los inputs (Ohm, Length) en la misma línea.
    if (item.inputs) {
      return (
        <View
          key={item.id}
          style={[
            styles.itemBlock,
            editable && !open && styles.itemLocked,
            marked && styles.itemToFix,
          ]}
        >
          {marked && <Text style={styles.toFixTag}>TO FIX</Text>}
          <View style={styles.itemTopRow}>
            <Text style={styles.itemLabel}>{item.label}</Text>
            <View style={styles.inlineInputs}>
              {item.inputs.map(input => {
                const v = d.inputs?.[input.id] ?? '';
                return (
                  <TextInput
                    key={input.id}
                    style={[
                      styles.subFieldInput,
                      styles.inlineNamedInput,
                      !v.trim() && styles.inputMissing,
                    ]}
                    value={v}
                    editable={open}
                    keyboardType={input.numeric ? 'decimal-pad' : 'default'}
                    onChangeText={t =>
                      update(item.id, {
                        inputs: { ...d.inputs, [input.id]: t },
                      })
                    }
                    placeholder={input.label}
                    placeholderTextColor={colors.placeholder}
                  />
                );
              })}
            </View>
          </View>
        </View>
      );
    }

    // Solo medida (door trimmer: Height / Width): sin YES, el input en la
    // misma línea del punto.
    if (item.measurement && item.noAnswer) {
      return (
        <View
          key={item.id}
          style={[
            styles.itemBlock,
            editable && !open && styles.itemLocked,
            marked && styles.itemToFix,
          ]}
        >
          {marked && <Text style={styles.toFixTag}>TO FIX</Text>}
          <View style={styles.itemTopRow}>
            <Text style={styles.itemLabel}>{item.label}</Text>
            <TextInput
              style={[
                styles.subFieldInput,
                styles.measureInput,
                !d.measurement?.trim() && styles.inputMissing,
              ]}
              value={d.measurement}
              editable={open}
              keyboardType="decimal-pad"
              onChangeText={t => update(item.id, { measurement: t })}
              placeholder="Measure"
              placeholderTextColor={colors.placeholder}
            />
          </View>
        </View>
      );
    }

    if (item.field) {
      return (
        <View
          key={item.id}
          style={[styles.fieldRow, editable && !open && styles.itemLocked]}
        >
          <Text style={styles.fieldLabel}>{item.label}</Text>
          <TextInput
            style={[styles.fieldInput, fail && styles.inputError]}
            value={d.value}
            editable={open}
            keyboardType={item.field === 'number' ? 'decimal-pad' : 'default'}
            onChangeText={t => update(item.id, { value: t })}
            placeholder={item.field === 'number' ? '0' : ''}
            placeholderTextColor={colors.placeholder}
          />
        </View>
      );
    }

    return (
      <View
        key={item.id}
        style={[
          styles.itemBlock,
          editable && !open && styles.itemLocked,
          marked && styles.itemToFix,
        ]}
      >
        {marked && <Text style={styles.toFixTag}>TO FIX</Text>}
        {/* Como en la hoja: el punto a la izquierda, YES / NO a la derecha */}
        <View
          style={[
            styles.itemTopRow,
            !!item.choices && styles.itemTopRowStacked,
          ]}
        >
          <Text style={[styles.itemLabel, fail && common.fail]}>
            {item.label}
          </Text>
          {item.noAnswer ? (
            // Sin YES / NO: cantidad y tipo en la misma línea.
            <View style={styles.inlineInputs}>
              <TextInput
                style={[
                  styles.subFieldInput,
                  styles.inlineQuantity,
                  !/^[1-9]\d*$/.test(d.quantity?.trim() ?? '') &&
                    styles.inputMissing,
                ]}
                value={d.quantity}
                editable={open}
                keyboardType="number-pad"
                onChangeText={t =>
                  update(item.id, { quantity: t.replace(/[^0-9]/g, '') })
                }
                placeholder="Qty"
                placeholderTextColor={colors.placeholder}
              />
              {/* Sin tipo (p. ej. # of hinges): solo la cantidad. */}
              {!!item.type && (
                <TextInput
                  style={[
                    styles.subFieldInput,
                    styles.inlineType,
                    !d.type?.trim() && styles.inputMissing,
                  ]}
                  value={d.type}
                  editable={open}
                  onChangeText={t => update(item.id, { type: t })}
                  placeholder="Type"
                  placeholderTextColor={colors.placeholder}
                />
              )}
            </View>
          ) : (
            <View style={styles.answerGroup}>
              {item.choices
                ? item.choices.map(c =>
                    chipFor(
                      c.label,
                      d.choice === c.label && d.result !== 'NA',
                      c.pass ? 'yes' : 'no',
                      () => toggle(c.pass ? 'YES' : 'NO', c.label),
                    ),
                  )
                : [
                    chipFor('YES', d.result === 'YES', 'yes', () =>
                      toggle('YES'),
                    ),
                    item.allowNo &&
                      chipFor('NO', d.result === 'NO', 'no', () =>
                        toggle('NO'),
                      ),
                  ]}
              {item.allowNA &&
                chipFor('N/A', d.result === 'NA', 'na', () => toggle('NA'))}
            </View>
          )}
        </View>

        {d.result !== 'NA' && item.measurement && (
          <View style={styles.subField}>
            <Text style={styles.subFieldLabel}>Measurement</Text>
            <TextInput
              style={[
                styles.subFieldInput,
                !d.measurement?.trim() && !!d.result && styles.inputMissing,
              ]}
              value={d.measurement}
              editable={open}
              keyboardType="decimal-pad"
              onChangeText={t => update(item.id, { measurement: t })}
              placeholder="e.g. 38.875"
              placeholderTextColor={colors.placeholder}
            />
          </View>
        )}
        {d.result !== 'NA' && item.quantity && !item.noAnswer && (
          <View style={styles.subField}>
            <Text style={styles.subFieldLabel}>Quantity</Text>
            <TextInput
              style={[
                styles.subFieldInput,
                styles.quantityInput,
                !!d.result &&
                  !/^[1-9]\d*$/.test(d.quantity?.trim() ?? '') &&
                  styles.inputMissing,
              ]}
              value={d.quantity}
              editable={open}
              keyboardType="number-pad"
              onChangeText={t =>
                update(item.id, { quantity: t.replace(/[^0-9]/g, '') })
              }
              placeholder="0"
              placeholderTextColor={colors.placeholder}
            />
          </View>
        )}
        {d.result !== 'NA' && item.type === 'text' && !item.noAnswer && (
          <View style={styles.subField}>
            <Text style={styles.subFieldLabel}>
              Type{item.optionalType ? ' (optional)' : ''}
            </Text>
            <TextInput
              style={[
                styles.subFieldInput,
                !item.optionalType &&
                  !d.type?.trim() &&
                  !!d.result &&
                  styles.inputMissing,
              ]}
              value={d.type}
              editable={open}
              onChangeText={t => update(item.id, { type: t })}
              placeholderTextColor={colors.placeholder}
            />
          </View>
        )}
        {d.result !== 'NA' && Array.isArray(item.type) && (
          <View style={styles.subField}>
            <Text style={styles.subFieldLabel}>Type</Text>
            <View style={styles.typeChips}>
              {item.type.length === 1 ? (
                <Text style={styles.fixedType}>{item.type[0]}</Text>
              ) : item.dropdown ? (
                <Dropdown
                  value={d.type ?? ''}
                  options={item.type}
                  enabled={open}
                  missing={!d.type && !!d.result}
                  onChange={t => update(item.id, { type: t })}
                />
              ) : (
                item.type.map(t =>
                  chipFor(t, d.type === t, 'pick', () =>
                    update(item.id, { type: d.type === t ? '' : t }),
                  ),
                )
              )}
            </View>
          </View>
        )}
        {item.noteOn && d.choice === item.noteOn ? (
          // YES en "miss other hardware?": FAILED y escribir qué hace falta
          // (obligatorio).
          <View style={styles.subField}>
            <Text style={styles.subFieldLabel}>What is missing?</Text>
            <TextInput
              style={[
                styles.noteInput,
                !d.comment?.trim() && styles.inputMissing,
              ]}
              value={d.comment}
              editable={open}
              multiline
              onChangeText={t => update(item.id, { comment: t })}
              placeholder="Write what is missing"
              placeholderTextColor={colors.placeholder}
            />
          </View>
        ) : (d.result === 'NO' || !!d.comment) && (
          <TextInput
            style={styles.noteInput}
            value={d.comment}
            editable={open}
            multiline
            onChangeText={t => update(item.id, { comment: t })}
            placeholder="Note: what is wrong?"
            placeholderTextColor={colors.placeholder}
          />
        )}
      </View>
    );
  };

  const sections: { name: string; items: CheckItem[] }[] = [];
  part.items.forEach(item => {
    const last = sections[sections.length - 1];
    if (last && last.name === item.section) last.items.push(item);
    else sections.push({ name: item.section, items: [item] });
  });

  return (
    <KeyboardAvoidingView
      style={common.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 20}
    >
      <Header
        title={part.title}
        backLabel="Back"
        onBack={() => navigation.goBack()}
        right={`${answered}/${part.items.length}`}
      />
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${(answered / Math.max(part.items.length, 1)) * 100}%` },
          ]}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.subtitle}>
          {stageTitle} · {doorName(door)} · Job {door.jobNumber}
        </Text>
        {lastReorder && (
          <View style={[styles.reorderBanner, lastReorder.receivedAt && styles.reorderBannerDone]}>
            <Text style={styles.reorderBannerTitle}>
              REORDER #{reorders.length}
              {isHanger
                ? ` · ${lastReorder.part === 'FRAME' ? frameName : `Door ${doorName(door)}`}`
                : ''}
              {' · '}
              {new Date(lastReorder.at).toLocaleDateString()}
            </Text>
            <Text style={styles.reorderBannerText}>{lastReorder.defect}</Text>
            <Text style={styles.reorderBannerHint}>
              {lastReorder.receivedAt
                ? `New piece received ${new Date(lastReorder.receivedAt).toLocaleDateString()}${
                    lastReorder.receivedByName ? ` by ${lastReorder.receivedByName}` : ''
                  }.`
                : 'Waiting for the new piece: scan its label and confirm it to start.'}
            </Text>
          </View>
        )}
        {!isHanger && review === 'APPROVED' ? (
          <View style={[styles.readOnlyBanner, styles.approvedBanner]}>
            <Text style={[styles.readOnlyText, styles.approvedText]}>
              Approved by {part.approval?.byName || part.approval?.by || '—'}
              {part.approval?.at
                ? ` · ${new Date(part.approval.at).toLocaleString()}`
                : ''}
            </Text>
          </View>
        ) : frozen && review === 'WAITING' ? (
          <View style={[styles.readOnlyBanner, styles.waitingBanner]}>
            <Text style={[styles.readOnlyText, styles.waitingText]}>
              Review the answers with your Foreman or Door Room Hanger. They
              must press APPROVE and enter their ID to save them.
            </Text>
            {flaggedItems.length > 0 && (
              <Text style={[styles.readOnlyText, styles.waitingText, styles.flaggedText]}>
                {flaggedItems.length} point(s) answered NO (
                {flaggedItems.map(item => item.label).join(', ')}): the Foreman
                approves them as they are or sends them back to fix.
              </Text>
            )}
          </View>
        ) : frozen && review === 'FAILED' ? (
          <View style={[styles.readOnlyBanner, styles.failedBanner]}>
            <Text style={[styles.readOnlyText, common.fail]}>
              Saved with {failed} failed point(s). Press Edit to fix them before
              it can be approved.
            </Text>
          </View>
        ) : !canEdit && (
          <View style={styles.readOnlyBanner}>
            <Text style={styles.readOnlyText}>
              Read only — this stage is approved, locked or the door is
              completed.
            </Text>
          </View>
        )}
        {part.correction && (
          <View style={styles.fixBanner}>
            <Text style={styles.fixTitle}>
              Rejected by {part.correction.byName || part.correction.by}
            </Text>
            <Text style={styles.fixText}>{part.correction.comment}</Text>
            <Text style={styles.fixHint}>
              Fix the {part.correction.items.length} point(s) marked TO FIX, then
              SAVE.
            </Text>
          </View>
        )}

        {sections.map(section => (
          <View key={section.name} style={[common.card, styles.sectionCard]}>
            <Text style={common.sectionLabel}>{section.name}</Text>
            {section.items.some(it => it.ref && size[it.ref] !== null) && (
              <View style={styles.toleranceHeader}>
                <Text style={styles.toleranceText}>
                  Print: {size.hgt !== null && `H ${fmtInches(size.hgt)}`}
                  {size.hgt !== null && size.width !== null && '  ×  '}
                  {size.width !== null && `W ${fmtInches(size.width)}`}
                </Text>
                <Text style={styles.toleranceText}>Tolerance +0 / -1/16"</Text>
              </View>
            )}
            {section.items.map(renderItem)}
          </View>
        ))}

        <View style={[common.card, styles.sectionCard]}>
          <View style={common.infoRow}>
            <Text style={common.infoLabel}>Result</Text>
            <Text
              style={[
                common.infoValue,
                failed
                  ? common.fail
                  : flaggedItems.length
                  ? styles.flaggedResult
                  : allAnswered
                  ? common.ok
                  : null,
              ]}
            >
              {failed
                ? `${failed} FAILED`
                : flaggedItems.length && allAnswered
                ? `${flaggedItems.length} NO · FOREMAN REVIEW`
                : allAnswered
                ? 'ALL OK'
                : `${part.items.length - answered} LEFT`}
            </Text>
          </View>
          <Text style={common.textAreaLabel}>Comments</Text>
          <TextInput
            style={common.textArea}
            multiline
            editable={editable}
            value={comment}
            onChangeText={t => {
              if (!dirty) setDirty(true);
              setComment(t);
            }}
            placeholder="Write something..."
            placeholderTextColor={colors.placeholder}
            textAlignVertical="top"
          />
        </View>
      </ScrollView>

      {frozen ? (
        // Guardado: respuestas congeladas. Edit las abre; APPROVE pide el ID.
        <View style={common.navRow}>
          <TouchableOpacity
            style={[common.navBtn, !canEdit && common.disabled]}
            onPress={() => setEditing(true)}
            disabled={!canEdit}
          >
            <Text style={common.navBtnText}>Edit</Text>
          </TouchableOpacity>
          {part.canReorder && reorderButton}
          <TouchableOpacity
            style={[common.primaryBtn, review !== 'WAITING' && common.disabled]}
            // Con puntos NO: primero la decisión del foreman. Si no, directo
            // al ID (1529 aprueba sin teclear).
            onPress={() =>
              flaggedItems.length ? setDecideOpen(true) : decide(false)
            }
            disabled={review !== 'WAITING'}
          >
            <Text style={common.primaryBtnText}>
              {review === 'APPROVED' ? 'APPROVED' : 'APPROVE'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={common.navRow}>
          <TouchableOpacity
            style={common.navBtn}
            onPress={() =>
              !isHanger && part.saved && !part.correction
                ? cancelEdit()
                : navigation.goBack()
            }
          >
            <Text style={common.navBtnText}>Cancel</Text>
          </TouchableOpacity>
          {part.canReorder && reorderButton}
          <TouchableOpacity
            style={[
              common.primaryBtn,
              (!editable || saving || !allAnswered) && common.disabled,
            ]}
            onPress={requestSave}
            disabled={!editable || saving || !allAnswered}
          >
            <Text style={common.primaryBtnText}>
              {saving ? 'Saving...' : 'SAVE'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* SAVE: aviso de que hace falta aprobación antes de guardar */}
      <Modal
        visible={confirmSave}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmSave(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Approval required</Text>
            <Text style={styles.modalMessage}>
              To save the answers of {part.title}, approval from your Foreman or
              Door Room Hanger is required.{'\n\n'}Show this message to your
              Foreman or Door Room Hanger.
            </Text>
            <View style={styles.modalRow}>
              <TouchableOpacity
                style={common.navBtn}
                onPress={() => setConfirmSave(false)}
              >
                <Text style={common.navBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={common.primaryBtn}
                onPress={() => {
                  setConfirmSave(false);
                  handleSave();
                }}
              >
                <Text style={common.primaryBtnText}>Review answers</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* APPROVE: directo al ID de quien aprueba (sin resumen). El aviso
          "Approval required" ya salió al dar SAVE. */}
      {/* APPROVE con puntos NO: el foreman decide antes de su ID. */}
      <Modal
        visible={decideOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDecideOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Points answered NO</Text>
            {flaggedItems.map(item => {
              const note = drafts[item.id]?.comment?.trim();
              return (
                <Text key={item.id} style={styles.modalMessage}>
                  {item.label}
                  {note ? `\n“${note}”` : ''}
                </Text>
              );
            })}
            <Text style={styles.modalMessage}>
              Approve the checklist as it is, or send these points back to fix?
            </Text>
            <TouchableOpacity
              style={[common.primaryBtn, styles.decideBtn]}
              onPress={() => decide(false)}
            >
              <Text style={common.primaryBtnText}>Approve as is</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[common.navBtn, styles.decideBtn, styles.sendBackBtn]}
              onPress={() => decide(true)}
            >
              <Text style={[common.navBtnText, common.fail]}>Send back to fix</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[common.navBtn, styles.decideBtn]}
              onPress={() => setDecideOpen(false)}
            >
              <Text style={common.navBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ApproverModal
        visible={approverOpen}
        message={
          sendBackMode
            ? `Enter the ID of an Administrator, Foreman or Door Room Hanger to send ${part.title} back to fix.`
            : `Enter the ID of an Administrator, Foreman or Door Room Hanger to approve ${part.title}.`
        }
        onSubmit={sendBackMode ? sendBack : approve}
        onCancel={() => {
          setApproverOpen(false);
          setSendBackMode(false);
        }}
      />

      <ReorderModal
        visible={reorderOpen}
        piece={pieceName}
        // Door Hanger revisa las dos piezas: se elige cuál se reordena.
        pieces={
          isHanger
            ? [
                { key: 'DOOR', label: `Door ${doorName(door)}` },
                { key: 'FRAME', label: frameName },
              ]
            : undefined
        }
        onCancel={() => setReorderOpen(false)}
        onContinue={reason => {
          setReorderOpen(false);
          setReorderReason(reason);
        }}
      />
      {/* Reorden: aviso -> resumen (razón, job, pieza) -> ID -> label NCM.
          El usuario maestro (1529) no teclea nada. */}
      <ApprovalSteps
        visible={!!reorderReason}
        notice="An Administrator, Foreman or Door Room Hanger must approve this reorder."
        reviewText="Review Reorder"
        summaryTitle="Review Reorder"
        rows={[
          { label: 'Reason for Reorder', value: reorderReason?.defect ?? '' },
          { label: 'Job', value: `${door.jobNumber ?? ''} · ${reorderPiecesText}` },
        ]}
        cancelText="Cancel Reorder"
        approveText="Approve Reorder"
        approverMessage={
          isHanger
            ? 'Enter the ID of an Administrator, Foreman or Door Room Hanger to send it to reorder. Everything answered for the reordered piece and this Door Hanger checklist will be erased.'
            : `Enter the ID of an Administrator, Foreman or Door Room Hanger to send ${pieceName} to reorder. Everything answered for this piece will be erased.`
        }
        bypassID={canBypassLocks(user) ? user.ID : null}
        onApprove={id => sendReorder(id)}
        onCancel={cancelReorder}
      />
      <NcmLabelModal
        label={ncmLabels[0] ?? null}
        title={`${ncmLabels[0]?.piece ?? ''} sent to reorder`}
        doneText={ncmLabels.length > 1 ? 'Next label' : 'Done'}
        onDone={() => {
          if (ncmLabels.length > 1) {
            setNcmLabels(prev => prev.slice(1));
            return;
          }
          setNcmLabels([]);
          resetToStart(navigation, user);
        }}
      />

      {/* Al pasar el checklist: a escanear otro label o al siguiente checklist */}
      <Modal visible={!!passed} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.modalBackdrop}>
          {partKey === 'HANGER' ? (
            // Checklist del Hanger: si con él quedó todo aprobado, la puerta
            // se completó; si no, faltan aprobaciones.
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>
                {passed?.doorCompleted
                  ? `${doorName(door)} from Job: ${door.jobNumber} completed correctly.`
                  : 'Hanging QC saved correctly'}
              </Text>
              <Text style={styles.modalMessage}>
                {passed?.doorCompleted
                  ? 'You can view the report in Tafco Admin.'
                  : 'Some checklists of this door are still waiting for approval. Open each one and press APPROVE; the door is completed when all of them are approved.'}
              </Text>
              <TouchableOpacity
                style={[common.primaryBtn, styles.modalButton]}
                onPress={() => resetToStart(navigation, user)}
              >
                <Text style={common.primaryBtnText}>Scan another label</Text>
              </TouchableOpacity>
            </View>
          ) : (
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>
              {passed?.doorCompleted
                ? `${doorName(door)} from Job: ${door.jobNumber} completed correctly.`
                : `${part.title} approved correctly`}
            </Text>
            <TouchableOpacity
              style={[common.primaryBtn, styles.modalButton]}
              onPress={() => resetToStart(navigation, user)}
            >
              <Text style={common.primaryBtnText}>Scan another label</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                common.primaryBtn,
                styles.modalButton,
                !passed?.next && common.disabled,
              ]}
              disabled={!passed?.next}
              onPress={() => {
                const next = passed?.next;
                if (!next) return;
                resetToStart(navigation, user, {
                  name: 'PartChecklist',
                  params: { door, stageKey: next.stageKey, partKey: next.partKey },
                });
              }}
            >
              <Text style={common.primaryBtnText}>Go to next checklist</Text>
            </TouchableOpacity>
            {passed?.next ? (
              <Text style={styles.modalNext}>
                {passed.next.stageTitle} - {passed.next.partTitle}
              </Text>
            ) : (
              <Text style={styles.modalNext}>No more checklists for this door.</Text>
            )}
          </View>
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  reorderBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: colors.red,
    alignItems: 'center',
  },
  reorderBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  reorderBanner: {
    backgroundColor: colors.amberBg,
    borderColor: colors.amber,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  reorderBannerDone: { backgroundColor: '#eceef2', borderColor: '#c5cad3' },
  reorderBannerTitle: { fontSize: 14, fontWeight: '800', color: colors.amber },
  reorderBannerText: { fontSize: 14, color: colors.ink, marginTop: 4 },
  reorderBannerHint: { fontSize: 12, color: colors.muted, marginTop: 4 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalBox: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.navy, marginBottom: 16, textAlign: 'center' },
  // primaryBtn trae flex: 1 (pensado para filas); aquí iría a lo alto y se aplasta.
  modalButton: { flex: 0, marginBottom: 10 },
  modalRow: { flexDirection: 'row', gap: 10 },
  modalMessage: { fontSize: 15, color: colors.ink, textAlign: 'center', marginBottom: 18 },
  modalNext: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 4 },
  // Punto rechazado por la revisión final.
  itemToFix: {
    borderWidth: 2,
    borderColor: colors.redBorder,
    backgroundColor: colors.redBg,
    borderRadius: 10,
    padding: 8,
  },
  toFixTag: {
    alignSelf: 'flex-start',
    color: '#fff',
    backgroundColor: colors.red,
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginBottom: 6,
    overflow: 'hidden',
  },
  fixBanner: {
    backgroundColor: colors.redBg,
    borderColor: colors.redBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  fixTitle: { fontSize: 14, fontWeight: '700', color: colors.red },
  fixText: { fontSize: 14, color: colors.ink, marginTop: 4 },
  fixHint: { fontSize: 12, color: colors.muted, marginTop: 6 },
  loader: {
    marginTop: 60,
  },
  progressTrack: {
    height: 4,
    backgroundColor: colors.navyText,
  },
  progressFill: {
    height: 4,
    backgroundColor: colors.navy,
  },
  content: {
    padding: 16,
    paddingBottom: 30,
  },
  subtitle: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 10,
  },
  readOnlyBanner: {
    backgroundColor: '#eceef2',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  readOnlyText: {
    fontSize: 13,
    color: '#4b5160',
    textAlign: 'center',
  },
  approvedBanner: { backgroundColor: colors.greenBg },
  approvedText: { color: colors.green, fontWeight: '700' },
  waitingBanner: { backgroundColor: colors.amberBg },
  waitingText: { color: colors.amber, fontWeight: '600' },
  failedBanner: { backgroundColor: colors.redBg },
  sectionCard: {
    marginBottom: 12,
  },
  itemLocked: {
    opacity: 0.35,
  },
  itemBlock: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  itemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  itemTopRowStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  itemLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
  },
  answerGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  subField: {
    marginTop: 8,
  },
  subFieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  subFieldInput: {
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.inputBg,
  },
  typeChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    minWidth: 52,
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#08a8f99',
    backgroundColor: colors.inputBg,
  },
  chipText: {
    fontWeight: '700',
    fontSize: 13,
    color: colors.muted,
  },
  chipYes: {
    borderColor: colors.green,
    backgroundColor: colors.greenBg,
  },
  chipNo: {
    borderColor: colors.redBorder,
    backgroundColor: colors.redBg,
  },
  chipNa: {
    borderColor: '#8a8f99',
    backgroundColor: '#eceef2',
  },
  chipPick: {
    borderColor: colors.navy,
    backgroundColor: colors.navySoft,
  },
  chipPickText: {
    color: colors.navy,
  },
  typeLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
  fixedType: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.navy,
  },
  extraRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  extraInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.inputBg,
  },
  inputMissing: {
    borderColor: '#515151',
  },
  quantityInput: {
    width: 110,
    textAlign: 'center',
  },
  inlineInputs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineQuantity: {
    width: 70,
    textAlign: 'center',
  },
  inlineType: {
    width: 150,
  },
  // Heat: Ohm / Length.
  inlineNamedInput: {
    width: 100,
  },
  inputOk: {
    borderColor: colors.green,
    backgroundColor: colors.greenBg,
  },
  measureInput: {
    width: 130,
    textAlign: 'center',
    borderColor: '#515151',
    borderWidth: 1.5,
  },
  measureHint: {
    alignSelf: 'flex-end',
    width: 130,
    textAlign: 'center',
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  toleranceHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 6,
    backgroundColor: colors.navySoft,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: -4,
    marginBottom: 4,
  },
  toleranceText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.navy,
  },
  measureBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  measureOk: {
    backgroundColor: colors.greenBg,
  },
  measureOut: {
    backgroundColor: colors.redBg,
  },
  measureBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  refText: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
  },
  inputError: {
    borderColor: colors.redBorder,
    backgroundColor: colors.redBg,
  },
  noteInput: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
    color: colors.ink,
    minHeight: 40,
    backgroundColor: colors.inputBg,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  fieldLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
  },
  // Puntos NO (allowNo) esperando la decisión del foreman.
  flaggedText: { marginTop: 8, fontWeight: '700' },
  flaggedResult: { color: colors.amber },
  decideBtn: { flex: 0, marginTop: 10 },
  sendBackBtn: { backgroundColor: colors.redBg },
  fieldInput: {
    width: 130,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.inputBg,
    textAlign: 'center',
  },
});

export default PartChecklistScreen;
