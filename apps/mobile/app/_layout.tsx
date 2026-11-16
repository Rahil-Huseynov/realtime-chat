import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
      PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      ).catch(console.warn);
    }
  }, []);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0b0f1a' },
        animation: 'fade',
      }}
    />
  );
}