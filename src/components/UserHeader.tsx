import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useUser } from '../hooks/useUser';
import { colors } from '../theme';

// Header azul: título arriba; abajo "< Back | usuario | job" y el botón de
// log out a la derecha. El título cambia por pantalla; job y onBack son
// opcionales (sin onBack no hay botón de regresar).
const UserHeader: React.FC<{ title: string; job?: string; onBack?: () => void }> = ({
  title,
  job,
  onBack,
}) => {
  const user = useUser();
  const navigation = useNavigation<any>();

  const handleLogout = () => {
    Alert.alert('Log out', 'Do you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem('user');
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        },
      },
    ]);
  };

  return (
    <View style={styles.headerBox}>
      <Text style={styles.headerText}>{title}</Text>
      <View style={styles.userRow}>
        {onBack && (
          <TouchableOpacity style={[styles.pill, styles.backButton]} onPress={onBack}>
            <Icon name="chevron-back" size={16} color="#fff" />
            <Text style={[styles.pillText, styles.backText]}>Back</Text>
          </TouchableOpacity>
        )}
        {/* "nombre | ID" (y el job si hay); entre Back y Log out va centrado */}
        <Text style={[styles.userText, onBack && styles.userTextMiddle]} numberOfLines={1}>
          {user ? `${user.Name || ''}${user.Name ? '  |  ' : ''}${user.ID}` : ''}
          {job ? `  |  ${job}` : ''}
        </Text>
        <TouchableOpacity style={[styles.pill, styles.logoutButton]} onPress={handleLogout}>
          <Icon name="log-out-outline" size={16} color="#fff" />
          <Text style={[styles.pillText, styles.logoutText]}>Log out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  headerBox: {
    backgroundColor: colors.navy,
    paddingTop: 50,
    paddingBottom: 22,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerText: { color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  userRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  userText: { flexShrink: 1, color: '#fff', fontSize: 13, fontWeight: '600' },
  pill: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  pillText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  logoutButton: { flexDirection: 'row', alignItems: 'center', marginLeft: 8 },
  backButton: { flexDirection: 'row', alignItems: 'center', paddingLeft: 8 },
  backText: { marginLeft: 2 },
  // Con Back a la izquierda, el usuario ocupa el centro de la fila.
  userTextMiddle: { flex: 1, textAlign: 'center' },
  logoutText: { marginLeft: 4 },
});

export default UserHeader;
