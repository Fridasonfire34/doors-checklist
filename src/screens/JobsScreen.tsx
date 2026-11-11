import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  TextInput,
  Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { API_BASE } from '../api';
import { ScreenProps } from '../navigation';
import { useUser } from '../hooks/useUser';
import UserHeader from '../components/UserHeader';
import { colors, common } from '../theme';

type Job = { jobNumber: string; totalDoors: number; pendingDoors: number };

// Jobs de TAFCO Main que todavía tienen al menos un door pendiente.
const JobsScreen: React.FC<ScreenProps<'Jobs'>> = ({ navigation }) => {
  const user = useUser();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const fetchJobs = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      const response = await fetch(`${API_BASE}/jobs`);
      if (!response.ok) throw new Error('Error fetching jobs');
      const data = await response.json();
      setJobs(data.jobs || []);
    } catch (error) {
      console.error('Error loading jobs:', error);
      Alert.alert('Error', 'Could not load the jobs. Try again later.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Recarga al volver de un job, por si se completaron doors.
  useFocusEffect(
    useCallback(() => {
      fetchJobs();
    }, [])
  );

  if (!user) {
    return (
      <View style={common.container}>
        <Text style={common.loadingText}>Loading user info...</Text>
      </View>
    );
  }

  const term = search.trim().toLowerCase();
  const visibleJobs = term ? jobs.filter((j) => j.jobNumber.toLowerCase().includes(term)) : jobs;

  return (
    <View style={common.container}>
      <UserHeader
        title="Doors Checklist"
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
      />

      <View style={styles.sectionBox}>
        <Text style={styles.sectionTitle}>Choose a job</Text>
        <Text style={styles.sectionSubtitle}>Jobs with doors pending inspection</Text>
        <View style={styles.searchBox}>
          <Icon name="search" size={16} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search job number"
            placeholderTextColor={colors.placeholder}
          />
        </View>
      </View>

      <View style={styles.listWrapper}>
        {loading ? (
          <ActivityIndicator size="large" color={colors.navy} />
        ) : (
          <FlatList
            data={visibleJobs}
            keyExtractor={(item) => item.jobNumber}
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => navigation.navigate('JobMenu', { jobNumber: item.jobNumber })}>
                <View style={styles.card}>
                  <Text style={styles.cardJobNumber}>{item.jobNumber}</Text>
                  <View style={common.badge}>
                    <Text style={common.badgeText}>
                      {item.pendingDoors}/{item.totalDoors} pending
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.emptyText}>No jobs with pending doors.</Text>}
            ListFooterComponent={
              <Image source={require('../assets/images/Tafco-logo.png')} style={styles.footerLogo} />
            }
            contentContainerStyle={styles.listContent}
            refreshing={refreshing}
            onRefresh={() => fetchJobs(true)}
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  sectionBox: {
    marginTop: 20,
    marginBottom: 8,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.ink,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: '#fff',
  },
  searchInput: {
    flex: 1,
    height: 44,
    marginLeft: 8,
    color: colors.ink,
    fontSize: 15,
  },
  listWrapper: {
    flex: 1,
    marginHorizontal: 16,
    marginTop: 8,
  },
  listContent: {
    paddingBottom: 40,
    flexGrow: 1,
  },
  card: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 2,
  },
  cardJobNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    flexShrink: 1,
  },
  footerLogo: {
    alignSelf: 'center',
    width: 220,
    height: 80,
    marginTop: 10,
    resizeMode: 'contain',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 30,
    color: colors.muted,
    fontSize: 14,
  },
});

export default JobsScreen;
