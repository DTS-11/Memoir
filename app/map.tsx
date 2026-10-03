import React, { useMemo, useState, useEffect } from "react";
import { View, StyleSheet, Pressable, Text } from "react-native";
import MapView, { Marker, Callout } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as MediaLibrary from "expo-media-library/legacy";

import { usePhotos, Photo } from "../src/hooks/usePhotos";
import { useTheme } from "../src/theme/ThemeProvider";
import { GlassView } from "../src/components/GlassView";
import { photoToParams } from "../src/utils/photoParams";

export default function MapScreen() {
  const { photos } = usePhotos();
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  
  // State for photos that have resolved locations
  const [photosWithLocations, setPhotosWithLocations] = useState<Photo[]>([]);

  useEffect(() => {
    // If photos already have location, we can use them right away
    const directLocations = photos.filter(p => p.location && p.location.latitude && p.location.longitude);
    setPhotosWithLocations(directLocations);
    
    // For photos without location, we could theoretically fetch them, but getAssetInfoAsync is too slow.
    // The instructions implied we can rely on MediaLibrary.Asset's location field if we map it!
  }, [photos]);

  const handleMarkerPress = (photo: Photo) => {
    router.push({
      pathname: "/photo/[id]",
      params: { ...photoToParams(photo) },
    });
  };

  return (
    <View style={styles.container}>
      <MapView
        style={StyleSheet.absoluteFillObject}
        initialRegion={{
          latitude: photosWithLocations[0]?.location?.latitude ?? 37.78825,
          longitude: photosWithLocations[0]?.location?.longitude ?? -122.4324,
          latitudeDelta: 9.0922,
          longitudeDelta: 9.0421,
        }}
        showsUserLocation
      >
        {photosWithLocations.map((photo) => (
          <Marker
            key={photo.id}
            coordinate={{
              latitude: photo.location!.latitude,
              longitude: photo.location!.longitude,
            }}
            onCalloutPress={() => handleMarkerPress(photo)}
          >
            <View style={styles.markerContainer}>
               <Image
                 source={{ uri: photo.uri }}
                 style={styles.markerImage}
                 contentFit="cover"
                 cachePolicy="memory-disk"
               />
            </View>
            <Callout tooltip>
               <View style={[styles.callout, { backgroundColor: colors.surfaceElevated }]}>
                  <Text style={[typography.subhead, { color: colors.text }]}>
                    {new Date(photo.creationTime).toLocaleDateString()}
                  </Text>
                  <Text style={[typography.footnote, { color: colors.textSecondary }]}>
                    Tap to view
                  </Text>
               </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      {/* Back Button */}
      <GlassView
        intensity={80}
        style={[
          styles.header,
          {
            top: insets.top + 10,
          },
        ]}
      >
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
          <Text style={[typography.body, { color: colors.text }]}>Back</Text>
        </Pressable>
      </GlassView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    position: "absolute",
    left: 16,
    borderRadius: 20,
    overflow: "hidden",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
  },
  markerContainer: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: "#fff",
    padding: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  markerImage: {
    flex: 1,
    borderRadius: 6,
  },
  callout: {
    padding: 8,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 4,
  }
});
