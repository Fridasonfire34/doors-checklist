import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import RNPrint from 'react-native-print';
import RNFS from 'react-native-fs';
import axios from 'axios';
import { API_BASE, Door, StageInfo, doorName, isDoorDone } from '../api';
import { ScreenProps } from '../navigation';
import Header from '../components/Header';
import StageStatusBadge from '../components/StageStatusBadge';
import { colors, common } from '../theme';

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

// PDF del door (api-mobile/doors/report). Se puede generar en cualquier
// momento; mientras el door no esté completo sale como vista previa con lo
// capturado hasta ahora.
const ReportScreen: React.FC<ScreenProps<'Report'>> = ({ navigation, route }) => {
  const [door, setDoor] = useState<Door>(route.params.door);
  const [generating, setGenerating] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetch(`${API_BASE}/doors?door=${encodeURIComponent(route.params.door.idOk)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => data?.doors?.[0] && setDoor(data.doors[0]))
        .catch((e) => console.error('Error refreshing door:', e));
    }, [route.params.door.idOk])
  );

  const done = isDoorDone(door);

  const [stages, setStages] = useState<StageInfo[]>([]);
  useEffect(() => {
    fetch(`${API_BASE}/doors?door=${encodeURIComponent(route.params.door.idOk)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data?.stages && setStages(data.stages))
      .catch((e) => console.error('Error loading stages:', e));
  }, [route.params.door.idOk]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const response = await axios.get(`${API_BASE}/report?door=${encodeURIComponent(door.idOk)}`, {
        responseType: 'arraybuffer',
      });
      const fileName = `door_${door.jobNumber}_${doorName(door)}`.replace(/[^\w.-]+/g, '_');
      const filePath = `${RNFS.CachesDirectoryPath}/${fileName}.pdf`;
      await RNFS.writeFile(filePath, arrayBufferToBase64(response.data), 'base64');
      await RNPrint.print({ filePath });
    } catch (error) {
      console.error('Error generating/printing report:', error);
      Alert.alert('Error', 'Could not generate the report. Check your connection and try again.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <View style={common.container}>
      <Header title="Report" backLabel="Door" onBack={() => navigation.goBack()} />

      <View style={styles.content}>
        <View style={common.card}>
          <View style={common.infoRow}>
            <Text style={common.infoLabel}>Job</Text>
            <Text style={common.infoValue}>{door.jobNumber}</Text>
          </View>
          <View style={common.infoDivider} />
          <View style={common.infoRow}>
            <Text style={common.infoLabel}>Door</Text>
            <Text style={common.infoValue}>{doorName(door)}</Text>
          </View>
          <View style={common.infoDivider} />
          {stages.map((stage) => (
            <React.Fragment key={stage.key}>
              <View style={common.infoRow}>
                <Text style={common.infoLabel}>{stage.title}</Text>
                <StageStatusBadge status={door.stages?.[stage.key] ?? 'LOCKED'} />
              </View>
              <View style={common.infoDivider} />
            </React.Fragment>
          ))}
          <View style={common.infoRow}>
            <Text style={common.infoLabel}>Photos</Text>
            <Text style={common.infoValue}>{door.photoCount}</Text>
          </View>
        </View>

        <View style={[styles.banner, done ? styles.bannerOk : styles.bannerWarn]}>
          <Text style={[styles.bannerText, done ? common.ok : styles.warn]}>
            {done
              ? 'Door completed. The report is final.'
              : 'Preview: the door is not completed yet; the report shows what has been captured so far.'}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.generateButton, generating && common.disabled]}
          onPress={handleGenerate}
          disabled={generating}
        >
          {generating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.generateButtonText}>Generate & Print Report</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.exitButton} onPress={() => navigation.goBack()}>
          <Text style={styles.exitButtonText}>Exit</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
    padding: 20,
  },
  banner: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 16,
  },
  bannerOk: {
    backgroundColor: colors.greenBg,
  },
  bannerWarn: {
    backgroundColor: '#fff8e1',
  },
  bannerText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  warn: {
    color: '#8a6d00',
  },
  generateButton: {
    marginTop: 20,
    paddingVertical: 15,
    borderRadius: 10,
    backgroundColor: colors.navy,
    alignItems: 'center',
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  exitButton: {
    marginTop: 12,
    paddingVertical: 15,
    borderRadius: 10,
    backgroundColor: '#f0f2f6',
    alignItems: 'center',
  },
  exitButtonText: {
    color: colors.navy,
    fontSize: 15,
    fontWeight: '700',
  },
});

export default ReportScreen;
