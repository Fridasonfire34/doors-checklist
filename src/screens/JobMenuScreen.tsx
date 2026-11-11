import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { API_BASE, Door, JobPaperwork, StageInfo, canBypassLocks, fmtDate, isDoorDone } from '../api';
import { useUser } from '../hooks/useUser';
import { ScreenProps } from '../navigation';
import Header from '../components/Header';
import { colors, common } from '../theme';
import { GOLD, stageTheme } from '../stageTheme';

const LOCKED = { color: '#b0b7c3', soft: '#f1f2f5' };

type StepState = 'done' | 'active' | 'locked';

// Menú del job: primero confirmar que llegó el paperwork, luego las 4 etapas
// como pasos (Build -> Molding -> Trimming -> Door hanger), cada una con
// cuántos doors ya la pasaron, cuántos esperan aprobación y cuántos hay que
// corregir.
const JobMenuScreen: React.FC<ScreenProps<'JobMenu'>> = ({
  navigation,
  route,
}) => {
  const { jobNumber } = route.params;
  const [doors, setDoors] = useState<Door[]>([]);
  const [stages, setStages] = useState<StageInfo[]>([]);
  const [paperwork, setPaperwork] = useState<JobPaperwork>(null);
  const [confirming, setConfirming] = useState(false);
  const [canConfirm, setCanConfirm] = useState(false);
  const [loading, setLoading] = useState(true);
  const user = useUser();
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      try {
        const response = await fetch(
          `${API_BASE}/doors?jobNumber=${encodeURIComponent(
            jobNumber,
          )}&user=${encodeURIComponent(user?.ID ?? '')}`,
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        setDoors(data.doors || []);
        setStages(data.stages || []);
        setPaperwork(data.paperwork ?? null);
        setCanConfirm(!!data.canConfirmPaperwork);
      } catch (e) {
        console.error('Error loading job:', e);
        Alert.alert('Error', 'Could not load this job. Check your connection.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [jobNumber, user],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const confirmPaperwork = () =>
    Alert.alert(
      'Paperwork received',
      `Confirm the paperwork for job ${jobNumber} was received?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            if (!user) return;
            setConfirming(true);
            try {
              const response = await fetch(`${API_BASE}/paperwork`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobNumber, userID: user.ID }),
              });
              const data = await response.json();
              if (!response.ok || !data.success)
                throw new Error(data?.error || 'Unknown error');
              await load();
            } catch (e) {
              Alert.alert(
                'Error',
                `Could not confirm the paperwork. ${
                  e instanceof Error ? e.message : ''
                }`,
              );
            } finally {
              setConfirming(false);
            }
          },
        },
      ],
    );

  // Con un solo door se va directo a sus checklists; con más, a la lista de doors.
  const openStage = (stage: StageInfo) => {
    const bypass = canBypassLocks(user);
    if (!paperwork && !bypass) {
      Alert.alert(
        'Paperwork first',
        'Confirm the paperwork for this job was received before starting the checklists.',
      );
      return;
    }
    if (doors.length === 1) {
      const door = doors[0];
      if (door.stages?.[stage.key] === 'LOCKED' && !bypass) {
        const prev = stages[stages.findIndex(st => st.key === stage.key) - 1];
        Alert.alert(
          'Locked',
          `${prev?.title ?? 'The previous stage'} has to be approved first.`,
        );
        return;
      }
      navigation.navigate('Stage', {
        door,
        stageKey: stage.key,
        backLabel: jobNumber,
      });
      return;
    }
    navigation.navigate('StageDoors', {
      jobNumber,
      stageKey: stage.key,
      stageTitle: stage.title,
    });
  };

  const total = doors.length;
  const completed = doors.filter(isDoorDone).length;
  const pct = total ? Math.round((completed / total) * 100) : 0;

  // Pasos del job: las etapas del servidor (Build -> Molding -> Trimming ->
  // Door hanger). Las medidas van dentro de Build (StageScreen).
  type Step = {
    key: string;
    title: string;
    meta: string;
    state: StepState;
    approved: number;
    waiting: number;
    toFix: number;
    onPress: () => void;
  };
  const steps: Step[] = [
    ...stages.map((stage): Step => {
      const statuses = doors.map(d => d.stages?.[stage.key]);
      const approved = statuses.filter(s => s === 'APPROVED').length;
      const open = statuses.filter(s => s && s !== 'LOCKED').length;
      return {
        key: stage.key,
        title: stage.title,
        meta:
          stage.key === 'HANGER'
            ? 'Final check · Door Room Hanger / Admin'
            : 'Door + Frame · each checklist needs approval',
        state:
          total > 0 && approved === total
            ? 'done'
            : open > 0
            ? 'active'
            : 'locked',
        approved,
        waiting: statuses.filter(s => s === 'WAITING_APPROVAL').length,
        toFix: statuses.filter(s => s === 'REJECTED' || s === 'FAILED').length,
        onPress: () => openStage(stage),
      };
    }),
  ];

  return (
    <View style={common.container}>
      <Header
        title="Checklists"
        backLabel="Jobs"
        onBack={() => navigation.goBack()}
      />

      {loading ? (
        <ActivityIndicator
          size="large"
          color={colors.navy}
          style={styles.loader}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
            />
          }
        >
          {/* Resumen del job */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryAccent} />
            <View style={styles.summaryBody}>
              <View style={styles.summaryTop}>
                <View style={styles.summaryJobCol}>
                  <Text style={styles.summaryLabel}>JOB</Text>
                  <Text style={styles.summaryJob}>{jobNumber}</Text>
                  <Text style={styles.summarySub}>
                    {completed} of {total} doors completed
                  </Text>
                </View>
                <View style={styles.pctCircle}>
                  <Text style={styles.pctText}>{pct}%</Text>
                </View>
              </View>
              {/* Una franja por etapa, del color de la etapa */}
              <View style={styles.stageStrip}>
                {stages.map(stage => {
                  const t = stageTheme(stage.key);
                  const approved = doors.filter(
                    d => d.stages?.[stage.key] === 'APPROVED',
                  ).length;
                  return (
                    <View key={stage.key} style={styles.stripCell}>
                      <View style={styles.stripTrack}>
                        <View
                          style={[
                            styles.stripFill,
                            {
                              backgroundColor: t.color,
                              width: `${total ? (approved / total) * 100 : 0}%`,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>

          {/* Paperwork: se confirma una vez por job, antes de cualquier checklist */}
          {paperwork ? (
            <View style={[styles.paperworkCard, styles.paperworkDone]}>
              <Icon name="document-text" size={22} color={colors.green} />
              <View style={styles.paperworkText}>
                <Text style={[styles.paperworkTitle, common.ok]}>
                  Paperwork received
                </Text>
                <Text style={styles.paperworkSub}>
                  {paperwork.receivedByName || paperwork.receivedBy} ·{' '}
                  {fmtDate(paperwork.receivedAt)}
                </Text>
              </View>
              <Icon name="checkmark-circle" size={22} color={colors.green} />
            </View>
          ) : (
            <View style={[styles.paperworkCard, styles.paperworkPending]}>
              <Icon
                name="document-text-outline"
                size={22}
                color={colors.amber}
              />
              <View style={styles.paperworkText}>
                <Text
                  style={[styles.paperworkTitle, styles.paperworkPendingText]}
                >
                  Paperwork received?
                </Text>
                <Text style={styles.paperworkSub}>
                  {canConfirm
                    ? 'Confirm it before starting the checklists.'
                    : 'Waiting for an Administrator, Foreman or Door Room Hanger to confirm it.'}
                </Text>
              </View>
              {canConfirm && (
                <TouchableOpacity
                  style={[styles.paperworkBtn, confirming && common.disabled]}
                  onPress={confirmPaperwork}
                  disabled={confirming}
                >
                  <Text style={styles.paperworkBtnText}>
                    {confirming ? '...' : 'Confirm'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <Text style={styles.sectionTitle}>Inspection steps</Text>

          {steps.map((step, index) => {
            const { state, approved, waiting, toFix } = step;
            const theme = stageTheme(step.key);
            const t = state === 'locked' ? { ...theme, ...LOCKED } : theme;
            const isLast = index === steps.length - 1;

            return (
              <View key={step.key} style={styles.stepRow}>
                {/* Línea de tiempo */}
                <View style={styles.rail}>
                  <View
                    style={[
                      styles.stepDot,
                      {
                        backgroundColor:
                          state === 'done' ? colors.green : t.color,
                      },
                    ]}
                  >
                    {state === 'done' ? (
                      <Icon name="checkmark" size={16} color="#fff" />
                    ) : (
                      <Text style={styles.stepDotText}>{index + 1}</Text>
                    )}
                  </View>
                  {!isLast && (
                    <View
                      style={[
                        styles.railLine,
                        state === 'done' && styles.railLineDone,
                      ]}
                    />
                  )}
                </View>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.stepCard,
                    state === 'locked' && styles.stepCardLocked,
                  ]}
                  onPress={step.onPress}
                >
                  <View
                    style={[styles.cardAccent, { backgroundColor: t.color }]}
                  />
                  <View style={styles.cardBody}>
                    <View style={styles.stepTop}>
                      <View
                        style={[styles.stepIcon, { backgroundColor: t.color }]}
                      >
                        <Icon name={theme.icon} size={22} color="#fff" />
                      </View>
                      <View style={styles.stepTitleCol}>
                        <Text
                          style={[
                            styles.stepTitle,
                            state === 'locked' && styles.lockedText,
                          ]}
                        >
                          {step.title}
                        </Text>
                        <Text style={styles.stepMeta}>{step.meta}</Text>
                      </View>
                      {state === 'done' ? (
                        <View style={styles.doneTag}>
                          <Text style={styles.doneTagText}>DONE</Text>
                        </View>
                      ) : (
                        <Icon
                          name={
                            state === 'locked'
                              ? 'lock-closed'
                              : 'chevron-forward'
                          }
                          size={18}
                          color={t.color}
                        />
                      )}
                    </View>

                    <View style={styles.progressRow}>
                      <View
                        style={[
                          styles.progressTrack,
                          { backgroundColor: t.soft },
                        ]}
                      >
                        <View
                          style={[
                            styles.progressFill,
                            {
                              width: `${total ? (approved / total) * 100 : 0}%`,
                              backgroundColor: t.color,
                            },
                          ]}
                        />
                      </View>
                      <Text style={[styles.progressText, { color: t.color }]}>
                        {approved}/{total}
                      </Text>
                    </View>

                    {(waiting > 0 || toFix > 0 || state === 'locked') && (
                      <View style={styles.pillRow}>
                        {waiting > 0 && (
                          <View style={[styles.pill, styles.pillWaiting]}>
                            <Icon name="time" size={12} color="#fff" />
                            <Text style={styles.pillText}>
                              {waiting} waiting approval
                            </Text>
                          </View>
                        )}
                        {toFix > 0 && (
                          <View style={[styles.pill, styles.pillFix]}>
                            <Icon name="alert-circle" size={12} color="#fff" />
                            <Text style={styles.pillText}>{toFix} to fix</Text>
                          </View>
                        )}
                        {state === 'locked' && (
                          <View style={[styles.pill, styles.pillLocked]}>
                            <Text style={styles.pillLockedText}>
                              {index === 0
                                ? 'Opens after the paperwork is confirmed'
                                : `Opens after ${steps[index - 1]?.title}`}
                            </Text>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              </View>
            );
          })}

          <Image
            source={require('../assets/images/Tafco-logo.png')}
            style={styles.footerLogo}
          />
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  loader: {
    marginTop: 60,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 18,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  summaryAccent: {
    width: 6,
    backgroundColor: GOLD,
  },
  summaryBody: {
    flex: 1,
    padding: 16,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryJobCol: {
    flex: 1,
  },
  summaryLabel: {
    color: GOLD,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  summaryJob: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '800',
    marginTop: 2,
  },
  summarySub: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  pctCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 5,
    borderColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff8ec',
  },
  pctText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#9a6a14',
  },
  stageStrip: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 14,
  },
  stripCell: {
    flex: 1,
  },
  stripTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#eef1f6',
    overflow: 'hidden',
  },
  stripFill: {
    height: 6,
    borderRadius: 3,
  },
  paperworkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginTop: 14,
  },
  paperworkDone: {
    backgroundColor: colors.greenBg,
    borderColor: '#b9dfbf',
  },
  paperworkPending: {
    backgroundColor: '#fff8e1',
    borderColor: '#f0d58a',
  },
  paperworkText: {
    flex: 1,
  },
  paperworkTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  paperworkPendingText: {
    color: '#8a6d00',
  },
  paperworkSub: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  paperworkBtn: {
    backgroundColor: colors.navy,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  paperworkBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 22,
    marginBottom: 10,
  },
  stepRow: {
    flexDirection: 'row',
  },
  rail: {
    width: 34,
    alignItems: 'center',
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  stepDotText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  railLine: {
    flex: 1,
    width: 2,
    backgroundColor: '#dfe3ea',
    marginTop: 4,
  },
  railLineDone: {
    backgroundColor: colors.green,
  },
  stepCard: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    marginLeft: 8,
    marginBottom: 14,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
  },
  stepCardLocked: {
    backgroundColor: '#f7f8fa',
  },
  footerLogo: {
    alignSelf: 'center',
    width: 220,
    height: 80,
    marginTop: 10,
    resizeMode: 'contain',
  },
  cardAccent: {
    width: 5,
  },
  cardBody: {
    flex: 1,
    padding: 14,
  },
  stepTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stepTitleCol: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  lockedText: {
    color: '#8a8f99',
  },
  stepMeta: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  doneTag: {
    backgroundColor: colors.green,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  doneTagText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
  },
  progressText: {
    marginLeft: 10,
    fontSize: 13,
    fontWeight: '800',
    minWidth: 36,
    textAlign: 'right',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pillWaiting: {
    backgroundColor: '#f0a020',
  },
  pillFix: {
    backgroundColor: '#e04848',
  },
  pillLocked: {
    backgroundColor: '#eceef2',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  pillLockedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8a8f99',
  },
});

export default JobMenuScreen;
