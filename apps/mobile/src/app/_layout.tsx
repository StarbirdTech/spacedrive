import { useState } from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SpacedriveProvider } from '../client';
import { AppResetContext } from '../contexts';
import '../global.css';

export default function RootLayout() {
  const [resetKey, setResetKey] = useState(0);

  const resetApp = () => {
    setResetKey((prev) => prev + 1);
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }} className="bg-sidebar">
      <SafeAreaProvider>
        <AppResetContext.Provider value={{ resetApp }}>
          <SpacedriveProvider key={resetKey}>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(drawer)" />
              <Stack.Screen
                name="search"
                options={{
                  presentation: 'modal',
                  animation: 'slide_from_bottom'
                }}
              />
              <Stack.Screen
                name="jobs"
                options={{
                  presentation: 'modal',
                  animation: 'slide_from_bottom'
                }}
              />
              <Stack.Screen
                name="location/[locationId]"
                options={{
                  animation: 'slide_from_right'
                }}
              />
              <Stack.Screen
                name="device/[deviceId]"
                options={{
                  animation: 'slide_from_right'
                }}
              />
              <Stack.Screen
                name="volume/[volumeId]"
                options={{
                  animation: 'slide_from_right'
                }}
              />
            </Stack>
          </SpacedriveProvider>
        </AppResetContext.Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
