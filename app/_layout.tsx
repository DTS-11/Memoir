import "react-native-gesture-handler";
import { useEffect, useRef, useState } from "react";
import * as SplashScreen from "expo-splash-screen";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { ThemeProvider, useTheme } from "../src/theme/ThemeProvider";
import { UpdateBanner } from "../src/components/UpdateBanner";
import { PhotoLibraryProvider } from "../src/hooks/usePhotos";
import { FaceProcessingProvider } from "../src/hooks/useFaceProcessing";
import { ErrorBoundary } from "../src/components/ErrorBoundary";

SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ fade: true, duration: 350 });

// The native splash shows only the app icon (transparent-background look). This
// overlay carries the same dark background + icon so the hand-off is seamless,
// and adds the "Memoir" wordmark at the bottom, then fades away.
function SplashOverlay() {
  const opacity = useRef(new Animated.Value(1)).current;
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 320,
        useNativeDriver: true,
      }).start(() => setGone(true));
    }, 1100);
    return () => clearTimeout(t);
  }, [opacity]);

  if (gone) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.splashOverlay, { opacity }]}
    >
      <Image
        source={require("../assets/memoir_logo.png")}
        style={styles.splashLogo}
        contentFit="contain"
      />
      <Text style={styles.splashWordmark}>Memoir</Text>
    </Animated.View>
  );
}

function Root() {
  const { colors, isDark } = useTheme();

  useEffect(() => {
    const t = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 80);
    return () => clearTimeout(t);
  }, []);

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
      <SplashOverlay />
    </View>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  splashOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
    backgroundColor: "#08080E",
    alignItems: "center",
    justifyContent: "center",
  },
  splashLogo: {
    width: 150,
    height: 150,
  },
  splashWordmark: {
    position: "absolute",
    bottom: 84,
    color: "#FFF",
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 1,
  },
});
