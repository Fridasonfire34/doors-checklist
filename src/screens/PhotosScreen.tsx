import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { launchCamera, CameraOptions } from 'react-native-image-picker';
import Icon from 'react-native-vector-icons/Ionicons';
import { API_BASE, doorName } from '../api';
import { ScreenProps } from '../navigation';
import { useUser } from '../hooks/useUser';
import Header from '../components/Header';
import { colors, common } from '../theme';

type Photo = { id: number; name: string; base64: string };

// Comprimidas en el teléfono: el reporte las reduce de todos modos y así
// no se sube una foto de varios MB por la red de planta.
const CAMERA_OPTIONS: CameraOptions = {
  mediaType: 'photo',
  saveToPhotos: false,
  includeBase64: true,
  cameraType: 'back',
  maxWidth: 1600,
  maxHeight: 1600,
  quality: 0.8,
};

// Evidencias de un door (sin carpetas: cada door tiene las suyas).
const PhotosScreen: React.FC<ScreenProps<'Photos'>> = ({ navigation, route }) => {
  const { door } = route.params;
  const user = useUser();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<Photo | null>(null);

  const fetchPhotos = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/photos?door=${encodeURIComponent(door.idOk)}`);
      if (!response.ok) throw new Error('Could not load the photos');
      const data = await response.json();
      setPhotos(data.photos || []);
    } catch (error) {
      console.error('Error loading photos:', error);
      Alert.alert('Error', 'Could not load the photos.');
    } finally {
      setLoading(false);
    }
  }, [door.idOk]);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  const handleTakePhoto = () => {
    launchCamera(CAMERA_OPTIONS, async (response) => {
      if (response.didCancel) return;
      if (response.errorCode) {
        Alert.alert('Camera error', response.errorMessage || response.errorCode);
        return;
      }
      const asset = response.assets?.[0];
      if (!asset?.base64 || !user) return;

      setUploading(true);
      try {
        const result = await fetch(`${API_BASE}/photos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ door: door.idOk, imageBase64: asset.base64, userId: user.ID }),
        });
        if (!result.ok) throw new Error(`HTTP ${result.status}`);
        const data = await result.json().catch(() => ({}));
        await fetchPhotos();
        // Las fotos son obligatorias: con la primera, una puerta con todos
        // sus checklists listos queda completa.
        if (data.doorCompleted) {
          Alert.alert(
            'Door completed',
            `${door.partNumber || door.panel || 'Door'} from Job: ${door.jobNumber} completed correctly.`,
          );
        }
      } catch (error) {
        console.error('Error uploading photo:', error);
        Alert.alert('Error', 'Could not upload the photo.');
      } finally {
        setUploading(false);
      }
    });
  };

  const handleDelete = () => {
    if (!selected || !user) return;
    Alert.alert('Delete photo', 'Are you sure you want to delete this photo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const response = await fetch(
              `${API_BASE}/photos?door=${encodeURIComponent(door.idOk)}&id=${selected.id}&user=${encodeURIComponent(user.ID)}`,
              { method: 'DELETE' }
            );
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            setSelected(null);
            await fetchPhotos();
          } catch (error) {
            console.error('Error deleting photo:', error);
            Alert.alert('Error', 'Could not delete the photo.');
          }
        },
      },
    ]);
  };

  return (
    <View style={common.container}>
      <Header
        title={`Photos · ${doorName(door)}`}
        backLabel="Door"
        onBack={() => navigation.goBack()}
        right={String(photos.length)}
      />

      <ScrollView contentContainerStyle={styles.grid}>
        {loading ? (
          <ActivityIndicator size="large" color={colors.navy} style={styles.loader} />
        ) : photos.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="images-outline" size={48} color={colors.placeholder} />
            <Text style={styles.emptyText}>No photos of this door yet.</Text>
          </View>
        ) : (
          photos.map((photo) => (
            <TouchableOpacity key={photo.id} style={styles.thumbWrapper} onPress={() => setSelected(photo)}>
              <Image source={{ uri: `data:image/jpeg;base64,${photo.base64}` }} style={styles.thumb} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <View style={common.navRow}>
        <TouchableOpacity
          style={[common.primaryBtn, styles.cameraBtn, uploading && common.disabled]}
          onPress={handleTakePhoto}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Icon name="camera" size={18} color="#fff" />
              <Text style={[common.primaryBtnText, styles.cameraBtnText]}>Take Photo</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalOverlay}>
          {selected && (
            <Image
              source={{ uri: `data:image/jpeg;base64,${selected.base64}` }}
              style={styles.modalImage}
              resizeMode="contain"
            />
          )}
          <View style={styles.modalButtons}>
            <TouchableOpacity style={[styles.modalButton, styles.closeButton]} onPress={() => setSelected(null)}>
              <Text style={styles.modalButtonText}>Close</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalButton, styles.deleteButton]} onPress={handleDelete}>
              <Text style={styles.modalButtonText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    flexGrow: 1,
  },
  loader: {
    marginTop: 40,
    flex: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    marginTop: 60,
  },
  emptyText: {
    marginTop: 10,
    color: colors.muted,
    fontSize: 15,
  },
  thumbWrapper: {
    width: '46%',
    margin: '2%',
    borderRadius: 10,
    overflow: 'hidden',
    elevation: 3,
    backgroundColor: '#fff',
  },
  thumb: {
    width: '100%',
    height: 150,
  },
  cameraBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  cameraBtnText: {
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalImage: {
    width: '92%',
    height: '78%',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
    width: '80%',
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  closeButton: {
    backgroundColor: '#8a8f99',
  },
  deleteButton: {
    backgroundColor: '#dc3545',
  },
  modalButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
});

export default PhotosScreen;
