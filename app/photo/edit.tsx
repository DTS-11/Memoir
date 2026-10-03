import { useState, useEffect } from "react";
import { View, StyleSheet, Text, Pressable, Alert } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImageManipulator from "expo-image-manipulator";
import * as MediaLibrary from "expo-media-library/legacy";
import { usePhotos } from "../../src/hooks/usePhotos";
import { GlassView } from "../../src/components/GlassView";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system";

export default function PhotoEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { photos, refresh } = usePhotos();
  const insets = useSafeAreaInsets();
  
  const photo = photos.find((p) => p.id === id);
  const [currentUri, setCurrentUri] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!currentUri && photo) {
      // Initialize with local file if possible
      MediaLibrary.getAssetInfoAsync(photo.id)
        .then((info) => {
          if (info && info.localUri) {
            setCurrentUri(info.localUri);
          } else {
            setCurrentUri(photo.uri);
          }
        })
        .catch(() => setCurrentUri(photo.uri));
    }
  }, [photo, currentUri]);

  const applyAction = async (action: ImageManipulator.Action) => {
    if (!currentUri) return;
    setIsProcessing(true);
    try {
      const result = await ImageManipulator.manipulateAsync(
        currentUri,
        [action],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
      );
      setCurrentUri(result.uri);
      Haptics.selectionAsync();
    } catch (error) {
      Alert.alert("Error", "Failed to edit image.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRotate = () => {
    applyAction({ rotate: 90 });
  };

  const handleFlip = () => {
    applyAction({ flip: ImageManipulator.FlipType.Horizontal });
  };

  const handleSave = async () => {
    if (!currentUri) return;
    setIsProcessing(true);
    try {
      await MediaLibrary.saveToLibraryAsync(currentUri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved", "The edited photo has been saved to your library.", [
        {
          text: "OK",
          onPress: () => {
            refresh(); // Refresh library
            router.back();
          },
        },
      ]);
    } catch (error) {
      Alert.alert("Error", "Could not save the photo.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (!photo || !currentUri) {
    return <View style={styles.root} />;
  }

  return (
    <View style={styles.root}>
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: currentUri }}
          style={styles.image}
          contentFit="contain"
          transition={200}
        />
      </View>

      <GlassView
        interactive
        intensity={72}
        style={[styles.topBar, { paddingTop: insets.top + 8 }]}
      >
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
          <Ionicons name="close" size={28} color="#FFF" />
        </Pressable>
        <Text style={styles.title}>Edit Photo</Text>
        <Pressable 
          onPress={handleSave} 
          hitSlop={12} 
          style={styles.iconBtn}
          disabled={isProcessing}
        >
          <Text style={styles.saveText}>Save</Text>
        </Pressable>
      </GlassView>

      <GlassView
        interactive
        intensity={72}
        style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}
      >
        <Pressable 
          style={styles.toolBtn} 
          onPress={handleRotate}
          disabled={isProcessing}
        >
          <Ionicons name="refresh" size={26} color="#FFF" />
          <Text style={styles.toolLabel}>Rotate</Text>
        </Pressable>

        <Pressable 
          style={styles.toolBtn} 
          onPress={handleFlip}
          disabled={isProcessing}
        >
          <Ionicons name="swap-horizontal" size={26} color="#FFF" />
          <Text style={styles.toolLabel}>Flip</Text>
        </Pressable>
      </GlassView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  imageContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  iconBtn: {
    padding: 4,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: "#FFF",
    fontSize: 17,
    fontWeight: "600",
  },
  saveText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: 16,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderCurve: "continuous",
  },
  toolBtn: {
    alignItems: "center",
    gap: 6,
    padding: 10,
  },
  toolLabel: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "500",
  },
});
