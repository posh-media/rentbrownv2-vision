import * as React from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { font, radius, t } from "../theme";

interface ToastCtx {
  toast: (message: string) => void;
}

const Ctx = React.createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = React.useState<string | null>(null);
  const opacity = React.useRef(new Animated.Value(0)).current;
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = React.useCallback(
    (m: string) => {
      setMessage(m);
      if (timer.current) clearTimeout(timer.current);
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() =>
          setMessage(null),
        );
      }, 2400);
    },
    [opacity],
  );

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      {message ? (
        <Animated.View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={[styles.toast, { top: insets.top + 12, opacity }]}
        >
          <Text style={styles.text}>{message}</Text>
        </Animated.View>
      ) : null}
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    alignSelf: "center",
    backgroundColor: t.bg.inverseStrong,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
    zIndex: 100,
    elevation: 10,
  },
  text: { fontFamily: font.semibold, fontSize: 13, color: t.text.inverse },
});
