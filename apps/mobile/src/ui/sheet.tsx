import * as React from "react";
import {
  AccessibilityInfo,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { radius, t } from "../theme";
import { GlassSurface } from "./surfaces";

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** auto = wrap content; tall = ~85% height */
  snap?: "auto" | "tall";
}

/** Animated slide-up sheet on a frosted glass surface. */
export function BottomSheet({ open, onClose, children, snap = "auto" }: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const translate = React.useRef(new Animated.Value(600)).current;
  const [visible, setVisible] = React.useState(open);

  React.useEffect(() => {
    if (open) {
      setVisible(true);
      void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
        Animated.timing(translate, {
          toValue: 0,
          duration: reduced ? 0 : 240,
          useNativeDriver: true,
        }).start();
      });
    } else if (visible) {
      Animated.timing(translate, { toValue: 600, duration: 200, useNativeDriver: true }).start(() =>
        setVisible(false),
      );
    }
  }, [open, translate, visible]);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Dismiss" accessibilityRole="button" style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Animated.View style={{ transform: [{ translateY: translate }] }}>
            <GlassSurface
              intensity={80}
              radius={radius.xl}
              style={[
                styles.sheet,
                snap === "tall" && { minHeight: "75%" },
                { paddingBottom: insets.bottom + 16 },
              ]}
            >
              <View style={styles.handle} />
              {children}
            </GlassSurface>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(36,28,24,0.45)" },
  sheet: { padding: 20, paddingTop: 10 },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: t.border.strong,
    marginBottom: 14,
  },
});
