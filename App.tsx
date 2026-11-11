import ScanScreen from './src/screens/ScanScreen';
import React, { useEffect } from 'react';
import { PermissionsAndroid, Platform, Alert } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { request, PERMISSIONS } from 'react-native-permissions';

import LoginScreen from './src/screens/LoginScreen';
import JobsScreen from './src/screens/JobsScreen';
import JobMenuScreen from './src/screens/JobMenuScreen';
import StageDoorsScreen from './src/screens/StageDoorsScreen';
import StageScreen from './src/screens/StageScreen';
import PartChecklistScreen from './src/screens/PartChecklistScreen';
import PieceMeasuresScreen from './src/screens/PieceMeasuresScreen';
import PhotosScreen from './src/screens/PhotosScreen';
import ReportScreen from './src/screens/ReportScreen';
import { RootStackParamList } from './src/navigation';

const Stack = createStackNavigator<RootStackParamList>();

const App: React.FC = () => {
  useEffect(() => {
    const requestCameraPermission = async (): Promise<void> => {
      if (Platform.OS === 'ios') {
        await request(PERMISSIONS.IOS.CAMERA);
      } else {
        const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
        if (result !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('Permission denied', 'The camera is needed to take door photos.');
        }
      }
    };
    requestCameraPermission();
  }, []);

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Login" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        
        
        <Stack.Screen name="Scan" component={ScanScreen} />
        <Stack.Screen name="Jobs" component={JobsScreen} />
        <Stack.Screen name="JobMenu" component={JobMenuScreen} />
        <Stack.Screen name="StageDoors" component={StageDoorsScreen} />
        <Stack.Screen name="Stage" component={StageScreen} />
        <Stack.Screen name="PieceMeasures" component={PieceMeasuresScreen} />
        <Stack.Screen name="PartChecklist" component={PartChecklistScreen} />
        <Stack.Screen name="Photos" component={PhotosScreen} />
        <Stack.Screen name="Report" component={ReportScreen} />
        
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default App;
