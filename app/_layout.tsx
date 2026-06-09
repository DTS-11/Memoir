import "react-native-gesture-handler";
import * as SplashScreen from "expo-splash-screen";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { View } from "react-native";
import { ThemeProvider, useTheme } from "../src/theme/ThemeProvider";
import { UpdateBanner } from "../src/components/UpdateBanner";
import { PhotoLibraryProvider } from "../src/hooks/usePhotos";
import { FaceProcessingProvider } from "../src/hooks/useFaceProcessing";

SplashScreen.hideAsync().catch(() => {});

function Root() {
  const { colors, isDark } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <UpdateBanner />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: "fade",
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="photo/[id]"
          options={{ animation: "fade", presentation: "transparentModal" }}
        />
        <Stack.Screen name="album/[id]" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="category/[key]" options={{ animation: "slide_from_right" }} />
        <Stack.Screen
          name="recently-deleted"
          options={{ animation: "slide_from_right" }}
        />
        <Stack.Screen name="favorites" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="archive" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="people/[id]" options={{ animation: "slide_from_right" }} />
        <Stack.Screen
          name="permission"
          options={{ presentation: "transparentModal", animation: "fade" }}
        />
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <PhotoLibraryProvider>
            <FaceProcessingProvider>
              <Root />
            </FaceProcessingProvider>
          </PhotoLibraryProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
