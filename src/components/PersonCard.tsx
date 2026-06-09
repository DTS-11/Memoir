import React, { memo, useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useTheme } from "../theme/ThemeProvider";
import type { PersonWithCover } from "../hooks/usePeople";

const CARD_SIZE = 76;

type Props = {
  person: PersonWithCover;
  onPress: (person: PersonWithCover) => void;
};

export const PersonCard = memo(function PersonCard({ person, onPress }: Props) {
  const { colors, typography } = useTheme();
  const handlePress = useCallback(() => onPress(person), [onPress, person]);

  const displayName = person.name ?? `Person ${person.id.slice(-4).toUpperCase()}`;

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.root, { opacity: pressed ? 0.75 : 1 }]}
    >
      <View style={[styles.circle, { backgroundColor: colors.thumbPlaceholder }]}>
        {person.coverThumbUri ? (
          <Image
            source={{ uri: person.coverThumbUri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            recyclingKey={person.id}
          />
        ) : (
          <View style={[styles.fallback, { backgroundColor: colors.surface }]}>
            <Text style={[styles.initials, { color: colors.textSecondary }]}>
              {displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
      </View>

      <Text
        numberOfLines={1}
        style={[typography.caption1, { color: colors.text, marginTop: 6 }]}
      >
        {displayName}
      </Text>

      <Text style={[typography.caption2, { color: colors.textSecondary }]}>
        {person.face_count}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  root: {
    width: CARD_SIZE + 16,
    alignItems: "center",
    paddingHorizontal: 4,
  },
  circle: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    borderRadius: CARD_SIZE / 2,
    overflow: "hidden",
  },
  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    fontSize: 28,
    fontWeight: "600",
  },
});
