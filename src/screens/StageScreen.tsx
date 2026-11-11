import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';

// Un ícono y color por checklist para distinguir el del door (café) y el
// del frame (naranja claro).
const PART_ICONS: Record<string, { name: string; color: string; bg: string }> =
  {
    DOOR: { name: 'door-closed', color: '#8b5a2b', bg: '#f3e8dc' },
    FRAME: { name: 'crop-portrait', color: '#f0954a', bg: '#fff0e2' },
    HANGER: { name: 'door-open', color: '#8b5a2b', bg: '#f3e8dc' },
  };
const partIconBg = (key: string) =>
  PART_ICONS[key] ? { backgroundColor: PART_ICONS[key].bg } : null;
import { API_BASE, Door, StageDetail, doorName, fmtDateTime } from '../api';
import { ScreenProps } from '../navigation';
import { useUser } from '../hooks/useUser';
import Header from '../components/Header';
import UserHeader from '../components/UserHeader';
import StageStatusBadge from '../components/StageStatusBadge';
import { colors, common } from '../theme';

// Hora tal como se guardó en la base (ver fmtDateTime en api.ts).
const fmtDate = (value: string) => fmtDateTime(value);

// Una etapa de un door: sus checklists (Door / Frame, o Door hanger) y en qué
// va cada uno (Waiting approval, Approved, To fix). La aprobación se hace por
// checklist en la pantalla Review (Hanger de Door Room / Foreman / admin).
const StageScreen: React.FC<ScreenProps<'Stage'>> = ({ navigation, route }) => {
  const { stageKey } = route.params;
  const user = useUser();
  const [door, setDoor] = useState<Door>(route.params.door);
  const [detail, setDetail] = useState<StageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSpecs, setShowSpecs] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const id = encodeURIComponent(route.params.door.idOk);
      const [stageRes, doorRes] = await Promise.all([
        fetch(
          `${API_BASE}/stage?door=${id}&stage=${stageKey}&user=${encodeURIComponent(
            user.ID,
          )}`,
        ),
        fetch(`${API_BASE}/doors?door=${id}`),
      ]);
      if (!stageRes.ok) throw new Error(`HTTP ${stageRes.status}`);
      setDetail(await stageRes.json());
      if (doorRes.ok) {
        const data = await doorRes.json();
        if (data.doors?.[0]) setDoor(data.doors[0]);
      }
    } catch (e) {
      console.error('Error loading stage:', e);
      Alert.alert('Error', 'Could not load this stage. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, [route.params.door.idOk, stageKey, user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!user || loading || !detail) {
    return (
      <View style={common.container}>
        <Header
          title="Loading..."
          backLabel={route.params.backLabel ?? 'Doors'}
          onBack={() => navigation.goBack()}
        />
        <ActivityIndicator
          size="large"
          color={colors.navy}
          style={styles.loader}
        />
      </View>
    );
  }

  const statusMessage = (() => {
    if (detail.doorDone) return 'Door completed — read only.';
    switch (detail.status) {
      case 'LOCKED':
        return detail.paperworkReceived
          ? `${detail.previousStage}: complete this checklist first.`
          : 'Confirm the job paperwork was received first (job menu).';
      case 'PENDING':
        return detail.parts.length > 1
          ? 'Fill in both checklists.'
          : 'Fill in the checklist.';
      case 'IN_PROGRESS':
        return 'One checklist passed. Fill in the other one.';
      case 'FAILED':
        return 'A checklist has failed points. Fix them and check again.';
      case 'WAITING_APPROVAL':
        return 'Everything passed. Waiting for a Door Room Hanger, Foreman or Admin to approve the checklists.';
      case 'WAITING_PHOTOS':
        return 'Door Hanger passed. Take the photos of the door (Photos below): the door is completed when they are uploaded.';
      case 'REJECTED':
        return 'A checklist was rejected. Fix the points marked TO FIX and save it again.';
      case 'APPROVED':
        return 'Approved.';
    }
  })();

  // Door hanger: la última etapa, con fotos, reporte y aprobaciones.
  const isFinalStage = detail.stage.key === 'HANGER';
  const partBadge = (part: StageDetail['parts'][number]) => {
    const saved = part.saved;
    if (part.review === 'TO_FIX')
      return {
        text: 'TO FIX',
        style: styles.badgeFail,
        textStyle: styles.badgeFailText,
      };
    if (!saved) return null;
    if (saved.status === 'COMPLETE' && part.review === 'WAITING_PHOTOS')
      return {
        text: 'WAITING PHOTOS',
        style: styles.badgeWait,
        textStyle: styles.badgeWaitText,
      };
    if (saved.status === 'COMPLETE')
      return part.review === 'WAITING'
        ? {
            text: 'WAITING APPROVAL',
            style: styles.badgeWait,
            textStyle: styles.badgeWaitText,
          }
        : {
            text: part.review === 'APPROVED' ? 'APPROVED' : 'PASSED',
            style: styles.badgeOk,
            textStyle: styles.badgeOkText,
          };
    const failed = saved.answers.filter(a => a.result === 'NO').length;
    return {
      text: `${failed} FAILED`,
      style: styles.badgeFail,
      textStyle: styles.badgeFailText,
    };
  };

  return (
    <KeyboardAvoidingView
      style={common.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <UserHeader
        title={detail.stage.title}
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Door */}
        <View style={styles.infoCard}>
          <View style={styles.infoCardTop}>
            <Text style={styles.doorName} numberOfLines={1}>
              {doorName(door)}
            </Text>
            <StageStatusBadge status={detail.status} />
          </View>
          <View style={common.infoDivider} />
          <View style={common.infoRow}>
            <Text style={common.infoLabel}>Job</Text>
            <Text style={common.infoValue}>{door.jobNumber}</Text>
          </View>
          <View style={common.infoRow}>
            <Text style={common.infoLabel}>Size (W x H)</Text>
            <Text style={common.infoValue}>
              {door.width || '?'}" x {door.hgt || '?'}"
              {door.panelIdentifier === '2R Door' ? '  ·  Revent' : ''}
            </Text>
          </View>
          <View style={styles.messageBox}>
            <Icon
              name="information-circle-outline"
              size={18}
              color={colors.navy}
            />
            <Text style={styles.messageText}>{statusMessage}</Text>
          </View>
          {detail.approval && (
            <View
              style={[
                styles.approvalBox,
                detail.approval.result === 'REJECTED'
                  ? styles.rejectedBox
                  : styles.approvedBox,
              ]}
            >
              <Text
                style={[
                  styles.approvalText,
                  detail.approval.result === 'REJECTED'
                    ? common.fail
                    : common.ok,
                ]}
              >
                {detail.approval.result === 'APPROVED'
                  ? 'Approved'
                  : 'Rejected'}{' '}
                by {detail.approval.byName || detail.approval.by}
                {' · '}
                {fmtDate(detail.approval.at)}
              </Text>
              {!!detail.approval.comment && (
                <Text style={styles.approvalComment}>
                  {detail.approval.comment}
                </Text>
              )}
            </View>
          )}
          {!!door.specs?.length && (
            <>
              <TouchableOpacity
                style={styles.specsToggle}
                onPress={() => setShowSpecs(!showSpecs)}
              >
                <Text style={styles.specsToggleText}>Packing list specs</Text>
                <Icon
                  name={showSpecs ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.navy}
                />
              </TouchableOpacity>
              {showSpecs &&
                door.specs.map(s => (
                  <View key={s.label} style={styles.specRow}>
                    <Text style={styles.specLabel}>{s.label}</Text>
                    <Text style={styles.specValue}>{s.value}</Text>
                  </View>
                ))}
            </>
          )}
        </View>

        {/* Checklists, igual que los botones del menú de ULC */}
        {detail.parts.map(part => {
          const badge = partBadge(part);
          const saved = part.saved;
          // Filled by someone else: only a Foreman / Hanger / admin can open it.
          const blocked = part.locked || !part.canView;
          // Build: las medidas de la pieza van antes de su checklist
          // (Door Measurements, Door Build QC, Frame Measurements, ...).
          const measurePart =
            stageKey === 'BUILD' && (part.key === 'DOOR' || part.key === 'FRAME')
              ? part.key
              : null;
          const measured = measurePart ? !!door.measures?.[measurePart] : false;
          return (
            <React.Fragment key={part.key}>
            {measurePart && (
              <TouchableOpacity
                style={styles.button}
                onPress={() =>
                  navigation.navigate('PieceMeasures', {
                    door,
                    stageKey,
                    partKey: measurePart,
                    fromMenu: true,
                  })
                }
              >
                <View style={styles.contentRow}>
                  <View style={[styles.iconCircle, styles.measureIcon]}>
                    <Icon name="resize" size={28} color="#2f6fb5" />
                  </View>
                  <View style={styles.buttonTextCol}>
                    <Text style={styles.buttonText}>
                      {measurePart === 'DOOR' ? 'Door' : 'Frame'} Measurements
                    </Text>
                    <Text style={styles.buttonSub}>
                      {measured ? 'All measures saved' : 'Measures missing'}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.badge,
                      measured ? styles.badgeOk : styles.badgeWait,
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        measured ? styles.badgeOkText : styles.badgeWaitText,
                      ]}
                    >
                      {measured ? 'DONE' : 'MISSING'}
                    </Text>
                  </View>
                  <Icon name="chevron-forward" size={20} color="#c7d2e8" />
                </View>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.button, blocked && styles.buttonDisabled]}
              disabled={blocked}
              onPress={() =>
                navigation.navigate('PartChecklist', {
                  door,
                  stageKey,
                  partKey: part.key,
                })
              }
            >
              <View style={styles.contentRow}>
                <View
                  style={[
                    styles.iconCircle,
                    !blocked && partIconBg(part.key),
                    blocked && styles.iconCircleDisabled,
                  ]}
                >
                  <MCIcon
                    name={
                      PART_ICONS[part.key]?.name ?? 'clipboard-check-outline'
                    }
                    size={32}
                    color={
                      blocked
                        ? '#a0a6b1'
                        : PART_ICONS[part.key]?.color ?? colors.navy
                    }
                  />
                </View>
                <View style={styles.buttonTextCol}>
                  <Text
                    style={[
                      styles.buttonText,
                      blocked && styles.buttonTextDisabled,
                    ]}
                  >
                    {part.title}
                  </Text>
                  <Text style={styles.buttonSub}>
                    {!saved
                      ? `${part.items.length} points`
                      : `${saved.filledByName || saved.filledBy} · ${fmtDate(
                          saved.filledAt,
                        )}` +
                        (part.canEdit
                          ? ''
                          : part.canView
                          ? ' · view only'
                          : ' · only they can open it')}
                  </Text>
                </View>
                {badge && (
                  <View style={[styles.badge, badge.style]}>
                    <Text style={[styles.badgeText, badge.textStyle]}>
                      {badge.text}
                    </Text>
                  </View>
                )}
                <Icon
                  name={
                    blocked
                      ? 'lock-closed'
                      : part.canEdit
                      ? 'chevron-forward'
                      : 'eye-outline'
                  }
                  size={20}
                  color={blocked ? '#b0b7c3' : '#c7d2e8'}
                />
              </View>
            </TouchableOpacity>
            </React.Fragment>
          );
        })}

        {/* Fotos y reporte solo al final de todo (Door hanger, la etapa sin aprobación) */}
        {isFinalStage && (
          <>
            <TouchableOpacity
              style={styles.button}
              onPress={() => navigation.navigate('Photos', { door })}
            >
              <View style={styles.contentRow}>
                <View style={styles.iconCircle}>
                  <Icon name="camera-outline" size={30} color={colors.navy} />
                </View>
                <View style={styles.buttonTextCol}>
                  <Text style={styles.buttonText}>Photos</Text>
                  <Text style={styles.buttonSub}>
                    {door.photoCount
                      ? `${door.photoCount} photo(s)`
                      : 'No photos yet'}
                  </Text>
                </View>
                <Icon name="chevron-forward" size={20} color="#c7d2e8" />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.button}
              onPress={() => navigation.navigate('Report', { door })}
            >
              <View style={styles.contentRow}>
                <View style={styles.iconCircle}>
                  <Image
                    source={require('../assets/images/ok.png')}
                    style={styles.buttonImage}
                  />
                </View>
                <View style={styles.buttonTextCol}>
                  <Text style={styles.buttonText}>Report</Text>
                  <Text style={styles.buttonSub}>PDF of every stage</Text>
                </View>
                <Icon name="chevron-forward" size={20} color="#c7d2e8" />
              </View>
            </TouchableOpacity>

          </>
        )}

        <Image
          source={require('../assets/images/Tafco-logo.png')}
          style={styles.footerLogo}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  loader: {
    marginTop: 60,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
  },
  infoCard: {
    ...common.card,
    marginBottom: 10,
  },
  infoCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  doorName: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.ink,
    flexShrink: 1,
    marginRight: 10,
  },
  messageBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.navySoft,
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  messageText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.navy,
  },
  approvalBox: {
    marginTop: 10,
    borderRadius: 10,
    padding: 10,
  },
  approvedBox: {
    backgroundColor: colors.greenBg,
  },
  rejectedBox: {
    backgroundColor: colors.redBg,
  },
  approvalText: {
    fontSize: 13,
    fontWeight: '700',
  },
  approvalComment: {
    marginTop: 4,
    fontSize: 13,
    color: colors.ink,
  },
  specsToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  specsToggleText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.navy,
  },
  specRow: {
    flexDirection: 'row',
    paddingVertical: 4,
  },
  specLabel: {
    width: 80,
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
  specValue: {
    flex: 1,
    fontSize: 13,
    color: colors.ink,
  },
  button: {
    backgroundColor: '#fff',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    marginVertical: 8,
    minHeight: 84,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  buttonDisabled: {
    backgroundColor: '#f7f8fa',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.navySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  measureIcon: {
    backgroundColor: '#e6eff9',
  },
  iconCircleDisabled: {
    backgroundColor: '#eceef2',
  },
  buttonImage: {
    width: 32,
    height: 32,
    resizeMode: 'contain',
  },
  buttonTextCol: {
    flex: 1,
  },
  buttonText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonTextDisabled: {
    color: '#a0a6b1',
  },
  buttonSub: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginRight: 8,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  badgeOk: {
    backgroundColor: colors.greenBg,
  },
  badgeOkText: {
    color: colors.green,
  },
  badgeFail: {
    backgroundColor: colors.redBg,
  },
  badgeFailText: {
    color: colors.red,
  },
  badgeWait: {
    backgroundColor: colors.amberBg,
  },
  badgeWaitText: {
    color: colors.amber,
  },
  footerLogo: {
    alignSelf: 'center',
    width: 220,
    height: 80,
    marginTop: 16,
    resizeMode: 'contain',
  },
});

export default StageScreen;
