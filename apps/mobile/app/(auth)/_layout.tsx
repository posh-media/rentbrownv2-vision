import { Stack, useRouter } from "expo-router";
import * as React from "react";

import { useSession } from "../../src/data/provider";
import { Screen, Skeleton, SkeletonCard } from "../../src/ui";

/**
 * Auth group guard: once a session exists the user should never see
 * welcome/login/signup — bounce to the app. While the session resolves (or a
 * redirect is in flight) render a skeleton instead of auth chrome, so a
 * signed-in user never gets an "unauthenticated flash".
 */
export default function AuthLayout() {
  const router = useRouter();
  const session = useSession();

  React.useEffect(() => {
    if (!session.isLoading && session.data) {
      router.replace("/(tabs)/home");
    }
  }, [router, session.isLoading, session.data]);

  if (session.isLoading || session.data) {
    return (
      <Screen scroll={false}>
        <Skeleton height={120} radius={24} />
        <SkeletonCard lines={3} />
      </Screen>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
