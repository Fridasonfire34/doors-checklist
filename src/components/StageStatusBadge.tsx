import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { StageStatus } from '../api';
import { colors } from '../theme';

export const STAGE_STATUS_STYLE: Record<StageStatus, { label: string; color: string; bg: string }> = {
  LOCKED: { label: 'Locked', color: '#8a8f99', bg: '#eceef2' },
  PENDING: { label: 'Pending', color: colors.navy, bg: colors.navySoft },
  IN_PROGRESS: { label: 'In progress', color: colors.amber, bg: colors.amberBg },
  FAILED: { label: 'Failed', color: colors.red, bg: colors.redBg },
  WAITING_APPROVAL: { label: 'Waiting approval', color: colors.amber, bg: colors.amberBg },
  WAITING_PHOTOS: { label: 'Waiting photos', color: colors.amber, bg: colors.amberBg },
  REJECTED: { label: 'Rejected', color: colors.red, bg: colors.redBg },
  APPROVED: { label: 'Approved', color: colors.green, bg: colors.greenBg },
};

const StageStatusBadge: React.FC<{ status: StageStatus; label?: string }> = ({ status, label }) => {
  const s = STAGE_STATUS_STYLE[status];
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Text style={[styles.text, { color: s.color }]}>{label ?? s.label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
  },
});

export default StageStatusBadge;
