import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { API_BASE, Door, canBypassLocks, doorName, parseInches } from '../api';
import { ScreenProps } from '../navigation';
import { useUser } from '../hooks/useUser';
import UserHeader from '../components/UserHeader';
import ApprovalSteps from '../components/ApprovalSteps';
import { colors, common } from '../theme';


type Field = { key: string; label: string };
type Subgroup = { title?: string; prefix?: string; rows: Field[][] };
type Group = { title: string; subgroups: Subgroup[] };

// Frame: interior y exterior, cada uno sin y con gasket. Cada subgrupo se
// dibuja con su propio frame (FrameDiagram) y sus cuatro cajas de medida.
const frameSubgroup = (prefix: string, title: string): Subgroup => ({
  title,
  prefix,
  rows: [
    [
      { key: `${prefix}.w`, label: 'Width' },
      { key: `${prefix}.h`, label: 'Height' },
    ],
    [
      { key: `${prefix}.ow`, label: 'Width opening' },
      { key: `${prefix}.oh`, label: 'Height' },
    ],
  ],
});

const FRAME_GROUPS: Group[] = [
  {
    title: 'Overall interior frame measures',
    subgroups: [
      frameSubgroup('int.ng', 'without gasket'),
      frameSubgroup('int.g', 'with gasket'),
    ],
  },
  {
    title: 'Overall exterior frame measures',
    subgroups: [
      frameSubgroup('ext.ng', 'without gasket'),
      frameSubgroup('ext.g', 'with gasket'),
    ],
  },
];

// Door: dimensiones con extrusión, por dentro y por fuera.
const doorGroup = (prefix: string, title: string): Group => ({
  title,
  subgroups: [
    {
      prefix,
      rows: [
        [
          { key: `${prefix}.w`, label: 'Width' },
          { key: `${prefix}.h`, label: 'Height' },
        ],
      ],
    },
  ],
});

const DOOR_GROUPS: Group[] = [
  doorGroup('in', 'Overall inside dimensions with extrusion'),
  doorGroup('out', 'Overall outside dimensions with extrusion'),
];

// Print tolerance shown on the screen (the checklist uses the same value).
const TOLERANCE_LABEL = 'Tolerance: 1/16" (0.0625)';

// Flecha de medida con puntas en los dos extremos. Va con position absolute:
// length es el largo en pt, style la posición.
const DimArrow: React.FC<{ vertical?: boolean; length: number; style?: object; color?: string }> = ({
  vertical,
  length,
  style,
  color = colors.navy,
}) =>
  vertical ? (
    <View style={[styles.arrowV, { height: length }, style]}>
      <Icon name="caret-up" size={10} color={color} />
      <View style={[styles.arrowLineV, { backgroundColor: color }]} />
      <Icon name="caret-down" size={10} color={color} />
    </View>
  ) : (
    <View style={[styles.arrowH, { width: length }, style]}>
      <Icon name="caret-back" size={10} color={color} />
      <View style={[styles.arrowLineH, { backgroundColor: color }]} />
      <Icon name="caret-forward" size={10} color={color} />
    </View>
  );

// Frame como en el boceto: techo (barra de arriba, más gruesa) y dos patas,
// abierto abajo. Afuera: width arriba y height a la derecha. Adentro de la
// apertura: "Opening", con su width y su height.
const FRAME_LEFT = 0; // dibujo pegado a la izquierda
const FRAME_TOP = 62;
const FRAME_W = 124;
const FRAME_H = 190;
const BAR_TOP = 42; // techo (2 pt más grueso que antes)
const BAR_SIDE = 22; // patas
const HOLLOW_L = FRAME_LEFT + BAR_SIDE;
const HOLLOW_W = FRAME_W - BAR_SIDE * 2;
const HOLLOW_T = FRAME_TOP + BAR_TOP;
// Cada fila es "etiqueta + caja" en la misma línea: Width [ ].
const LABEL_W = 80; // "height opening" cabe sin cortarse
const BOX_W = 88;

const FrameDiagram: React.FC<{
  prefix: string;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}> = ({ prefix, values, onChange }) => {
  // Escala del dibujo según el ancho de la pantalla: en tableta hasta 1.35x;
  // en teléfono un poco menos de 1x para que quepa con las cajas.
  // El dibujo base mide 322 x 262.
  const { width: windowWidth } = useWindowDimensions();
  const k = Math.min(1.35, (windowWidth - 68) / 322);
  const p = (n: number) => n * k;
  // Ancho del dibujo en unidades base. El frame se queda a la izquierda; las
  // etiquetas con sus cajas se centran en el espacio que sobra a su derecha.
  const availW = Math.max(0, windowWidth - 68);
  const bw = Math.max(322, availW / k);
  const drawingEnd = 150; // después de la flecha de height
  const blockW = LABEL_W + 4 + BOX_W; // etiqueta + hueco + caja
  const labelX = drawingEnd + Math.max(0, (bw - drawingEnd - blockW) / 2);
  const boxX = labelX + LABEL_W + 4;

  // Caja de medida, con el mismo borde rojo que el formulario cuando el valor no se entiende.
  // placeholder dice qué medida es (width / height), sobre todo dentro de la apertura.
  const box = (
    suffix: 'w' | 'h' | 'ow' | 'oh',
    placeholder: string,
    left: number,
    top: number,
    width: number,
  ) => {
    const key = `${prefix}.${suffix}`;
    const value = values[key] ?? '';
    const invalid = !!value.trim() && parseInches(value) === null;
    return (
      <TextInput
        key={key}
        style={[styles.diagInput, { left, top, width }, invalid && styles.inputError]}
        value={value}
        onChangeText={(t) => onChange(key, t)}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
      />
    );
  };

  // Una fila: etiqueta y caja en la misma línea (Width [ ]), con la caja
  // alineada al centro vertical de la etiqueta.
  const row = (label: string, suffix: 'w' | 'h' | 'ow' | 'oh', top: number) => (
    <React.Fragment key={suffix}>
      <Text
        numberOfLines={2}
        style={[
          styles.dimLabel,
          {
            left: labelX,
            top,
            width: LABEL_W,
            height: 34,
            fontSize: 10,
            textTransform: 'uppercase',
            textAlign: 'right',
            textAlignVertical: 'center',
          },
        ]}
      >
        {label}
      </Text>
      {box(suffix, '', boxX, top, BOX_W)}
    </React.Fragment>
  );

  // El dibujo base se escala con transform alrededor de su centro; el
  // contenedor de afuera reserva el tamaño ya escalado para el layout.
  return (
    <View style={{ width: Math.max(availW, p(322)), height: p(262), alignSelf: 'flex-start', marginTop: -14 }}>
    <View
      style={{
        position: 'absolute',
        left: Math.max(availW, p(322)) / 2 - bw / 2,
        top: p(262) / 2 - 131,
        width: bw,
        height: 262,
        transform: [{ scale: k }],
      }}
    >
      {/* flecha de width exterior, encima del frame */}
      <DimArrow length={FRAME_W} style={{ left: FRAME_LEFT, top: 39 }} />

      {/* frame: techo y dos patas */}
      <View style={[styles.frame, { left: FRAME_LEFT, top: FRAME_TOP, width: FRAME_W, height: FRAME_H }]}>
        <View style={[styles.frameBar, { height: BAR_TOP }]} />
        <View style={[styles.frameLeg, { left: 0, width: BAR_SIDE }]} />
        <View style={[styles.frameLeg, { right: 0, width: BAR_SIDE }]} />
      </View>

      {/* flecha de height exterior, a la derecha del frame */}
      <DimArrow vertical length={FRAME_H} style={{ left: FRAME_LEFT + FRAME_W + 4, top: FRAME_TOP }} />

      {/* columna de cajas: etiqueta arriba de cada caja */}
      {/* cuatro filas repartidas dentro del alto del frame: la primera arranca
          en la parte de arriba del frame y la última termina en su base */}
      {row('width', 'w', FRAME_TOP)}
      {row('height', 'h', FRAME_TOP + 52)}
      {row('width opening', 'ow', FRAME_TOP + 104)}
      {row('height opening', 'oh', FRAME_TOP + FRAME_H - 34)}

      {/* apertura: texto "opening" y flechas azules (ancho arriba, alto a la izquierda) */}
      <Text style={[styles.openingLabel, { left: HOLLOW_L, width: HOLLOW_W, top: 168 }]}>opening</Text>
      <DimArrow length={HOLLOW_W - 8} style={{ left: HOLLOW_L + 4, top: HOLLOW_T + 8 }} />
      <DimArrow
        vertical
        length={FRAME_TOP + FRAME_H - (HOLLOW_T + 8)}
        style={{ left: HOLLOW_L + 4, top: HOLLOW_T + 8 }}
      />
    </View>
    </View>
  );
};

// Puerta: dibujo de frente (fondo blanco) con flechas de width y height, y las
// cajas a la derecha, como en el frame. La imagen (1000 x 1000) se recorta a la
// puerta: a 240 de alto, la escala es 0.3.
const DOOR_T = 50; // arriba de la puerta (deja lugar a la flecha de width)
const DOOR_H = 240;
const DOOR_W = 126;
const DOOR_BASE_H = 300;

const DoorDiagram: React.FC<{
  prefix: string;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}> = ({ prefix, values, onChange }) => {
  const { width: windowWidth } = useWindowDimensions();
  const k = Math.min(1.35, (windowWidth - 68) / 322);
  const p = (n: number) => n * k;
  const availW = Math.max(0, windowWidth - 68);
  const bw = Math.max(322, availW / k);
  // Etiquetas y cajas centradas en el espacio a la derecha del dibujo.
  const drawingEnd = 146; // después de la flecha de height
  const blockW = LABEL_W + 4 + BOX_W;
  const labelX = drawingEnd + Math.max(0, (bw - drawingEnd - blockW) / 2);
  const boxX = labelX + LABEL_W + 4;

  const box = (suffix: 'w' | 'h', top: number) => {
    const key = `${prefix}.${suffix}`;
    const value = values[key] ?? '';
    const invalid = !!value.trim() && parseInches(value) === null;
    return (
      <TextInput
        key={key}
        style={[styles.diagInput, { left: boxX, top, width: BOX_W }, invalid && styles.inputError]}
        value={value}
        onChangeText={(t) => onChange(key, t)}
        keyboardType="decimal-pad"
        placeholderTextColor={colors.placeholder}
      />
    );
  };

  const row = (label: string, suffix: 'w' | 'h', top: number) => (
    <React.Fragment key={suffix}>
      <Text
        numberOfLines={2}
        style={[
          styles.dimLabel,
          {
            left: labelX,
            top,
            width: LABEL_W,
            height: 34,
            fontSize: 10,
            textTransform: 'uppercase',
            textAlign: 'right',
            textAlignVertical: 'center',
          },
        ]}
      >
        {label}
      </Text>
      {box(suffix, top)}
    </React.Fragment>
  );

  return (
    <View
      style={{
        width: Math.max(availW, p(322)),
        height: p(DOOR_BASE_H),
        alignSelf: 'flex-start',
        marginTop: -14,
      }}
    >
      <View
        style={{
          position: 'absolute',
          left: Math.max(availW, p(322)) / 2 - bw / 2,
          top: p(DOOR_BASE_H) / 2 - DOOR_BASE_H / 2,
          width: bw,
          height: DOOR_BASE_H,
          transform: [{ scale: k }],
        }}
      >
        {/* flecha de width arriba de la puerta */}
        <DimArrow length={DOOR_W} style={{ left: 0, top: DOOR_T - 14 }} />

        {/* puerta recortada de la imagen */}
        <View style={{ position: 'absolute', left: 0, top: DOOR_T, width: DOOR_W, height: DOOR_H, overflow: 'hidden' }}>
          <Image
            source={require('../assets/images/door-drawing.png')}
            style={{ position: 'absolute', left: -87, top: -30, width: 300, height: 300 }}
            resizeMode="cover"
          />
        </View>

        {/* flecha de height a la derecha de la puerta */}
        <DimArrow vertical length={DOOR_H} style={{ left: DOOR_W + 8, top: DOOR_T }} />

        {/* width y height juntos, centrados verticalmente en la puerta
            (el bloque mide 84: 50 de separación + caja de 34) */}
        {row('width', 'w', DOOR_T + DOOR_H / 2 - 42)}
        {row('height', 'h', DOOR_T + DOOR_H / 2 - 42 + 50)}
      </View>
    </View>
  );
};

// Pantalla entre el scan del label y el primer checklist. Frame y door
// tienen medidas distintas, por eso el partKey decide el formulario.
const PieceMeasuresScreen: React.FC<ScreenProps<'PieceMeasures'>> = ({
  navigation,
  route,
}) => {
  const { door, stageKey, partKey, fromMenu } = route.params;
  const user = useUser();
  const isFrame = partKey === 'FRAME';
  const groups = isFrame ? FRAME_GROUPS : DOOR_GROUPS;
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [approverOpen, setApproverOpen] = useState(false);

  // Medidas ya guardadas de este door (si lo escanearon antes), para editarlas.
  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(
          `${API_BASE}/measures?door=${encodeURIComponent(door.idOk)}&part=${partKey}`,
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const saved: Record<string, number> = data.measures?.measures ?? {};
        setValues(
          Object.fromEntries(Object.entries(saved).map(([k, v]) => [k, String(v)])),
        );
      } catch (e) {
        console.error('Error loading measures:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [door.idOk, partKey]);

  const allFields = groups.flatMap((g) =>
    g.subgroups.flatMap((s) => s.rows.flat()),
  );
  const complete = allFields.every(
    (f) => parseInches(values[f.key]) !== null,
  );

  // Usuario maestro (1529): puede seguir al checklist sin medidas completas,
  // sin guardarlas.
  const bypass = canBypassLocks(user);
  // Desde el menú del job solo se guarda: hacen falta todas las medidas.
  const canContinue = complete || (bypass && !fromMenu);

  // CONTINUE: con todas las medidas llenas se pide el ID de aprobación (modal).
  // El usuario maestro sin medidas completas sigue sin guardar.
  const handleContinue = () => {
    if (saving || !user) return;
    if (!complete && bypass) {
      navigation.navigate('PartChecklist', { door: door as Door, stageKey, partKey });
      return;
    }
    if (!complete) return;
    // Aviso -> resumen de las medidas -> ID (1529 aprueba sin teclear).
    setApproverOpen(true);
  };

  // Guarda las medidas con el ID de quien aprueba (Administrator o Hanger).
  // Devuelve el mensaje para el modal cuando el ID no puede aprobar.
  const saveMeasures = async (approverID: string): Promise<string | null> => {
    if (!user || saving || !approverID) return null;
    const measures = Object.fromEntries(
      allFields.map((f) => [f.key, parseInches(values[f.key])]),
    );
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/measures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          door: door.idOk,
          part: partKey,
          userID: user.ID,
          approverID,
          measures,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        // Código incorrecto: se queda en el modal para intentar de nuevo.
        if (response.status === 403) {
          return data.error || 'That ID is not allowed to approve';
        }
        throw new Error(data.error || 'Unknown error');
      }
      setApproverOpen(false);
      if (fromMenu) {
        Alert.alert('Saved', `${isFrame ? 'Frame' : 'Door'} measurements saved correctly.`);
        navigation.goBack();
        return null;
      }
      navigation.navigate('PartChecklist', { door: door as Door, stageKey, partKey });
    } catch (e) {
      Alert.alert(
        'Error',
        `Could not save the measures. ${e instanceof Error ? e.message : ''}`,
      );
    } finally {
      setSaving(false);
    }
    return null;
  };

  // Resumen para quien aprueba: cada medida con su grupo y sección.
  const pieceLabel = isFrame
    ? `Frame ${(door.partNumber ?? '').replace(/^D/i, 'J')}`
    : `Door ${doorName(door as Door)}`;
  const summaryRows = [
    { label: 'Job', value: `${door.jobNumber ?? ''} · ${pieceLabel}` },
    ...groups.flatMap((g) =>
      g.subgroups.flatMap((sub) =>
        sub.rows.flat().map((f) => ({
          label: [g.title, sub.title, f.label].filter(Boolean).join(' · '),
          value: values[f.key] ? `${values[f.key]}"` : '',
        })),
      ),
    ),
  ];

  // Tarjetas en el orden del formulario. En frame, "without gasket" (subgrupo 0)
  // es una sola tarjeta con las secciones interior y exterior; "with gasket" y
  // door son una tarjeta por sección.
  type Section = { title: string; sub: Subgroup };
  type CardItem = { key: string; subTitle?: string; sections: Section[] };
  const maxSubs = Math.max(0, ...groups.map((g) => g.subgroups.length));
  const cards: CardItem[] = Array.from({ length: maxSubs }).flatMap((_, si) => {
    const withSub = groups.filter((g) => g.subgroups[si]);
    if (isFrame) {
      return [
        {
          key: `sub-${si}`,
          subTitle: withSub[0]?.subgroups[si].title,
          sections: withSub.map((g) => ({ title: g.title, sub: g.subgroups[si] })),
        },
      ];
    }
    return withSub.map((g) => ({
      key: `${g.title}-${si}`,
      subTitle: g.subgroups[si].title,
      sections: [{ title: g.title, sub: g.subgroups[si] }],
    }));
  });

  const setValue = (key: string, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  // Door: un campo con su etiqueta, en dos columnas.
  const renderField = (field: Field) => {
    const value = values[field.key] ?? '';
    const invalid = !!value.trim() && parseInches(value) === null;
    return (
      <View key={field.key} style={styles.cell}>
        <Text style={styles.cellLabel}>{field.label}</Text>
        <TextInput
          style={[styles.input, invalid && styles.inputError]}
          value={value}
          onChangeText={(t) => setValue(field.key, t)}
          keyboardType="decimal-pad"
          placeholder="e.g. 38.875"
          placeholderTextColor={colors.placeholder}
        />
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={common.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 20}
    >
      <UserHeader
        title={isFrame ? 'Frame Measurements' : 'Door Measurements'}
        job={door.jobNumber ?? undefined}
        onBack={fromMenu ? () => navigation.goBack() : undefined}
      />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {loading ? (
          <ActivityIndicator size="large" color={colors.navy} style={styles.loader} />
        ) : null}

        {!loading && cards.map((card) => (
          <View key={card.key} style={[common.card, styles.card]}>
            {card.sections.map((section, idx) => (
              <View key={section.title} style={idx > 0 ? styles.sectionGap : null}>
                {/* encabezado de la sección: título del grupo a la izquierda y el
                    subtítulo de la tarjeta a la derecha, en la misma línea (en la
                    primera sección si la tarjeta tiene varias) */}
                <View style={styles.cardHeader}>
                  <Text style={[common.sectionLabel, styles.groupTitle]}>{section.title}</Text>
                  {idx === 0 && <Text style={styles.tolerance}>{TOLERANCE_LABEL}</Text>}
                  {idx === 0 && card.subTitle && (
                    <Text style={styles.subgroupTitle}>{card.subTitle}</Text>
                  )}
                </View>
                {section.sub.prefix && isFrame ? (
                  <FrameDiagram prefix={section.sub.prefix} values={values} onChange={setValue} />
                ) : section.sub.prefix ? (
                  <DoorDiagram prefix={section.sub.prefix} values={values} onChange={setValue} />
                ) : (
                  section.sub.rows.map((row, ri) => (
                    <View key={ri} style={styles.row}>
                      {row.map(renderField)}
                    </View>
                  ))
                )}
              </View>
            ))}
          </View>
        ))}
      </ScrollView>

      <View style={common.navRow}>
        <TouchableOpacity style={common.navBtn} onPress={() => navigation.goBack()}>
          <Text style={common.navBtnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[common.primaryBtn, (!canContinue || saving || loading) && common.disabled]}
          onPress={handleContinue}
          disabled={!canContinue || saving || loading}
        >
          <Text style={common.primaryBtnText}>{saving ? 'Saving...' : fromMenu ? 'SAVE' : 'CONTINUE'}</Text>
        </TouchableOpacity>
      </View>

      {/* Aprobación: ID de un Administrator / Foreman / Door Room Hanger para guardar */}
      <ApprovalSteps
        visible={approverOpen}
        notice={`An Administrator, Foreman or Door Room Hanger must approve these measurements.`}
        reviewText="Review Measures"
        summaryTitle="Review Measures"
        rows={summaryRows}
        cancelText="Cancel"
        approveText="Approve Measures"
        approverMessage="Enter the ID of an Administrator, Foreman or Door Room Hanger to save these measures."
        bypassID={bypass && user ? user.ID : null}
        onApprove={saveMeasures}
        onCancel={() => setApproverOpen(false)}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 30 },
  loader: { marginTop: 40 },
  subtitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  subtitle: { fontSize: 13, color: colors.muted, flexShrink: 1 },
  tolerance: { fontSize: 13, color: colors.muted, opacity: 0.8 },
  card: { marginBottom: 12 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 0,
  },
  groupTitle: { flexShrink: 1, marginBottom: 0 },
  cardSubTitleTop: { marginBottom: 6 },
  sectionGap: { marginTop: 28 },
  subgroupTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.navy,
    textAlign: 'right',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  cell: { flex: 1 },
  cellLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.inputBg,
  },
  inputError: {
    borderColor: colors.redBorder,
    backgroundColor: colors.redBg,
  },

  // Dibujo del frame: contenedor de tamaño fijo, todo con posición absoluta.
  diagram: { width: 290, height: 300, alignSelf: 'center', marginTop: 4 },
  frame: { position: 'absolute' },
  frameBar: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colors.navy },
  frameLeg: { position: 'absolute', top: 0, bottom: 0, backgroundColor: colors.navy },
  arrowH: { position: 'absolute', flexDirection: 'row', alignItems: 'center' },
  arrowLineH: { flex: 1, height: 1.5, backgroundColor: colors.navy },
  arrowV: { position: 'absolute', width: 10, alignItems: 'center', justifyContent: 'space-between' },
  arrowLineV: { flex: 1, width: 1.5, backgroundColor: colors.navy },
  dimLabel: { position: 'absolute', fontSize: 12, fontWeight: '600', color: colors.ink },
  openingLabel: {
    position: 'absolute',
    fontSize: 15,
    fontStyle: 'italic',
    color: colors.ink,
    textAlign: 'center',
  },
  diagInput: {
    position: 'absolute',
    height: 34,
    borderWidth: 1.5,
    borderColor: colors.navy,
    borderRadius: 8,
    paddingVertical: 0,
    paddingHorizontal: 6,
    fontSize: 12,
    fontWeight: '600',
    color: colors.ink,
    backgroundColor: colors.inputBg,
    textAlign: 'center',
  },
});

export default PieceMeasuresScreen;
