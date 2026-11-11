import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';

const DOOR_BROWN = '#8b5a2b';
import { API_BASE, Door, StageStatus, canBypassLocks, doorName } from '../api';
import { useUser } from '../hooks/useUser';
import { ScreenProps } from '../navigation';
import Header from '../components/Header';
import StageStatusBadge from '../components/StageStatusBadge';
import { colors, common } from '../theme';

// Lo que hay que atender primero arriba: para corregir, esperando
// aprobación, abiertos; los aprobados y bloqueados al final.
const ORDER: StageStatus[] = [
  'REJECTED',
  'FAILED',
  'WAITING_APPROVAL',
  'WAITING_PHOTOS',
  'IN_PROGRESS',
  'PENDING',
  'APPROVED',
  'LOCKED',
];

// Doors del job en una etapa.
const StageDoorsScreen: React.FC<ScreenProps<'StageDoors'>> = ({
  navigation,
  route,
}) => {
  const { jobNumber, stageKey, stageTitle } = route.params;
  const [doors, setDoors] = useState<Door[]>([]);
  const user = useUser();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDoors = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        const response = await fetch(
          `${API_BASE}/doors?jobNumber=${encodeURIComponent(jobNumber)}`,
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const list: Door[] = data.doors || [];
        list.sort(
          (a, b) =>
            ORDER.indexOf(a.stages[stageKey]) -
            ORDER.indexOf(b.stages[stageKey]),
        );
        setDoors(list);
      } catch (error) {
        console.error('Error loading doors:', error);
        Alert.alert('Error', 'Could not load the doors of this job.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [jobNumber, stageKey],
  );

  useFocusEffect(
    useCallback(() => {
      fetchDoors();
    }, [fetchDoors]),
  );

  const openDoor = (door: Door) => {
    if (door.stages[stageKey] === 'LOCKED' && !canBypassLocks(user)) {
      Alert.alert(
        'Locked',
        'The job paperwork has to be confirmed and the previous stage of this door approved first.',
      );
      return;
    }
    navigation.navigate('Stage', { door, stageKey });
  };

  return (
    <View style={common.container}>
      <Header
        title={stageTitle}
        backLabel={jobNumber}
        onBack={() => navigation.goBack()}
      />

      <View style={styles.listWrapper}>
        {loading ? (
          <ActivityIndicator
            size="large"
            color={colors.navy}
            style={styles.loader}
          />
        ) : (
          <FlatList
            data={doors}
            keyExtractor={item => item.idOk}
            renderItem={({ item }) => {
              const status = item.stages[stageKey];
              const locked = status === 'LOCKED' && !canBypassLocks(user);
              return (
                <TouchableOpacity
                  style={[styles.tile, locked && styles.cardLocked]}
                  activeOpacity={0.85}
                  onPress={() => openDoor(item)}
                >
                  <View style={styles.tileIcon}>
                    <MCIcon
                      name="door-closed"
                      size={34}
                      color={locked ? '#a0a6b1' : DOOR_BROWN}
                    />
                  </View>
                  <Text style={styles.tileName}>{doorName(item)}</Text>
                  <Text style={styles.tileSize}>
                    {item.width || '?'}" x {item.hgt || '?'}"
                  </Text>
                  {(item.panelIdentifier === '2R Door' ||
                    (item.qty ?? 1) > 1) && (
                    <Text style={styles.tileSize}>
                      {[
                        item.qty && item.qty > 1 ? `QTY ${item.qty}` : '',
                        item.panelIdentifier === '2R Door' ? 'Revent' : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  )}
                  <View style={styles.tileBadge}>
                    <StageStatusBadge status={status} />
                  </View>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.emptyText}>This job has no doors.</Text>
            }
            contentContainerStyle={styles.listContent}
            refreshing={refreshing}
            onRefresh={() => fetchDoors(true)}
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  listWrapper: {
    flex: 1,
    marginHorizontal: 16,
    marginTop: 16,
  },
  loader: {
    marginTop: 30,
  },
  listContent: {
    paddingTop: 8,
    paddingBottom: 40,
    flexGrow: 1,
    justifyContent: 'center',
  },
  // Un door por fila, con el contenido centrado.
  tile: {
    width: '88%',
    alignSelf: 'center',
    backgroundColor: '#fff',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 10,
    marginBottom: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
  },
  cardLocked: {
    opacity: 0.6,
  },
  tileIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#f3e8dc',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  tileName: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
  },
  tileSize: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
    textAlign: 'center',
  },
  tileBadge: {
    marginTop: 10,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 30,
    color: colors.muted,
    fontSize: 14,
  },
});

export default StageDoorsScreen;
