import { useCallback, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import type { FlashListRef } from "@shopify/flash-list";
import type { GridItem, LayoutFamily } from "../utils/grouping";
import { useTheme } from "../theme/ThemeProvider";

type Section = { title: string; subtitle?: string; y: number };

type Props = {
  /** Current scroll offset ÷ max scroll offset, range [0, 1]. */
  scrollFraction: Animated.SharedValue<number>;
  /** Visible height of the scroll area (pixels). */
  containerHeight: number;
  /** Total scrollable content height (pixels). */
  contentHeight: number;
  /** Section boundaries computed from the grid. */
  sections: Section[];
  /** Current layout family — determines whether snapping is active. */
  family: LayoutFamily;
  /** Ref to the underlying FlashList for imperative scrolling. */
  listRef: React.MutableRefObject<FlashListRef<GridItem> | null>;
  /** Y offset from top of screen where the scrollable area begins (header height). */
  topOffset?: number;
};

const THUMB_W = 4;
const THUMB_H = 44;
const TRACK_PAD_V = 6; // vertical breathing room at top/bottom

export function FastScrollBar({
  scrollFraction,
  containerHeight,
  contentHeight,
  sections,
  family,
  listRef,
  topOffset = 0,
}: Props) {
  const { colors, isDark } = useTheme() as ReturnType<typeof useTheme> & {
    isDark: boolean;
  };

  // Visible track height (excluding top/bottom padding)
  const trackH = Math.max(0, containerHeight - TRACK_PAD_V * 2);

  // Shared values
  const thumbTop = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const thumbScale = useSharedValue(1);
  const labelOpacity = useSharedValue(0);

  // Keep a JS-side copy of sections for the gesture handler runOnJS calls
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  const contentHeightRef = useRef(contentHeight);
  contentHeightRef.current = contentHeight;
  const trackHRef = useRef(trackH);
  trackHRef.current = trackH;
  const lastSnapIdxRef = useRef(-1);

  // Label shown while dragging
  const [label, setLabel] = useState<{ title: string; sub?: string } | null>(
    null,
  );

  // Sync thumb to scroll fraction when not dragging
  useAnimatedReaction(
    () => ({ f: scrollFraction.value, dragging: isDragging.value }),
    ({ f, dragging }) => {
      if (!dragging) {
        thumbTop.value = f * Math.max(0, trackH - THUMB_H);
      }
    },
  );

  // ── gesture helpers ─────────────────────────────────────────────────────────

  const snapToSection = useCallback((targetOffset: number): number => {
    const secs = sectionsRef.current;
    if (!secs.length) return targetOffset;
    let best = secs[0];
    for (const s of secs) {
      if (s.y <= targetOffset) best = s;
      else break;
    }
    return best.y;
  }, []);

  const handleDrag = useCallback(
    (rawThumbTop: number) => {
      const maxThumb = Math.max(1, trackHRef.current - THUMB_H);
      const fraction = rawThumbTop / maxThumb;
      const maxOffset = Math.max(
        0,
        contentHeightRef.current - trackHRef.current,
      );
      const rawOffset = fraction * maxOffset;

      const shouldSnap = family === "months" || family === "years";
      const targetOffset = shouldSnap ? snapToSection(rawOffset) : rawOffset;

      // Haptic + label update when snapping to a new section
      if (shouldSnap) {
        const secs = sectionsRef.current;
        const idx = secs.findIndex((s) => s.y === targetOffset);
        if (idx !== -1 && idx !== lastSnapIdxRef.current) {
          lastSnapIdxRef.current = idx;
          const s = secs[idx];
          setLabel({ title: s.title, sub: s.subtitle });
          Haptics.selectionAsync();
        }
      } else {
        // In days / all, show a rough date label without snapping
        const secs = sectionsRef.current;
        if (secs.length > 0) {
          let best = secs[0];
          for (const s of secs) {
            if (s.y <= rawOffset) best = s;
            else break;
          }
          const newLabel = { title: best.title, sub: best.subtitle };
          setLabel(newLabel);
        }
      }

      listRef.current?.scrollToOffset({
        offset: targetOffset,
        animated: false,
      });
    },
    [family, snapToSection, listRef],
  );

  const startThumbTop = useSharedValue(0);

  const pan = Gesture.Pan()
    .minDistance(0)
    .onStart(() => {
      isDragging.value = true;
      startThumbTop.value = thumbTop.value;
      thumbScale.value = withSpring(1.4, { damping: 18, stiffness: 350 });
      labelOpacity.value = withTiming(1, { duration: 120 });
      lastSnapIdxRef.current = -1;
    })
    .onUpdate((e) => {
      const maxThumb = Math.max(1, trackH - THUMB_H);
      const newTop = Math.max(
        0,
        Math.min(maxThumb, startThumbTop.value + e.translationY),
      );
      thumbTop.value = newTop;
      runOnJS(handleDrag)(newTop);
    })
    .onEnd(() => {
      isDragging.value = false;
      thumbScale.value = withSpring(1, { damping: 18, stiffness: 350 });
      labelOpacity.value = withTiming(0, { duration: 200 });
    });

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: thumbTop.value }, { scaleX: thumbScale.value }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: labelOpacity.value,
    transform: [{ translateY: thumbTop.value + THUMB_H / 2 - 22 }],
  }));

  const trackColor = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)";
  const thumbColor = isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.32)";

  return (
    <View
      style={[
        styles.container,
        { top: topOffset + TRACK_PAD_V, height: trackH },
      ]}
      pointerEvents="box-none"
    >
      {/* Label bubble */}
      <Animated.View style={[styles.label, labelStyle]} pointerEvents="none">
        {label && (
          <View
            style={[
              styles.labelBubble,
              { backgroundColor: colors.surfaceElevated },
            ]}
          >
            <Text style={[styles.labelTitle, { color: colors.text }]}>
              {label.title}
            </Text>
            {!!label.sub && (
              <Text style={[styles.labelSub, { color: colors.textSecondary }]}>
                {label.sub}
              </Text>
            )}
          </View>
        )}
      </Animated.View>

      {/* Track + draggable thumb */}
      <GestureDetector gesture={pan}>
        <View style={[styles.hitArea, { height: trackH }]}>
          {/* Visual track line */}
          <View style={[styles.track, { backgroundColor: trackColor }]} />
          {/* Thumb pill */}
          <Animated.View
            style={[styles.thumb, { backgroundColor: thumbColor }, thumbStyle]}
          />
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    right: 0,
    width: 28,
    alignItems: "center",
  },
  hitArea: {
    width: 28,
    alignItems: "center",
  },
  track: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    borderRadius: 1,
  },
  thumb: {
    position: "absolute",
    top: 0,
    width: THUMB_W,
    height: THUMB_H,
    borderRadius: THUMB_W / 2,
    transformOrigin: "right center",
  },
  label: {
    position: "absolute",
    right: 28 + 6,
  },
  labelBubble: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: "flex-end",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    minWidth: 80,
  },
  labelTitle: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  labelSub: {
    fontSize: 13,
    fontWeight: "500",
    marginTop: 1,
  },
});
