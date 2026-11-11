import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../api';

// Usuario guardado por LoginScreen.
export function useUser(): User | null {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    AsyncStorage.getItem('user')
      .then((data) => {
        if (data) setUser(JSON.parse(data));
      })
      .catch((e) => console.error('Error loading user:', e));
  }, []);
  return user;
}
