import { Tabs, useRouter } from "expo-router";
import { Building2, CircleUserRound, Compass, House, WalletCards } from "lucide-react-native";
import * as React from "react";

import { useScenario, useSession } from "../../src/data/provider";
import { Screen, Skeleton, SkeletonCard, TabBar } from "../../src/ui";

/**
 * Protected group guard. A resolved null session means the user belongs on
 * the auth stack — unless they deliberately chose guest browsing (the
 * "signed-out" prototype scenario, e.g. Welcome → "Browse first"), which is
 * allowed to roam the public tabs. While the session resolves, or while a
 * redirect is in flight, a skeleton stands in for the tabs so no
 * authenticated content flashes.
 */
export default function TabsLayout() {
  const router = useRouter();
  const session = useSession();
  const { scenario } = useScenario();
  const guestBrowsing = scenario === "signed-out";

  React.useEffect(() => {
    if (!session.isLoading && !session.data && !guestBrowsing) {
      router.replace("/(auth)/welcome");
    }
  }, [router, session.isLoading, session.data, guestBrowsing]);

  if (session.isLoading || (!session.data && !guestBrowsing)) {
    return (
      <Screen scroll={false}>
        <Skeleton height={40} width="60%" />
        <SkeletonCard lines={4} />
        <SkeletonCard lines={3} />
      </Screen>
    );
  }

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tabs.Screen
        name="home/index"
        options={{ title: "Home", tabBarIcon: (p) => <House size={22} color={p.color} /> }}
      />
      <Tabs.Screen
        name="explore/index"
        options={{ title: "Explore", tabBarIcon: (p) => <Compass size={22} color={p.color} /> }}
      />
      <Tabs.Screen
        name="portfolio/index"
        options={{ title: "Portfolio", tabBarIcon: (p) => <Building2 size={22} color={p.color} /> }}
      />
      <Tabs.Screen
        name="wallet/index"
        options={{ title: "Wallet", tabBarIcon: (p) => <WalletCards size={22} color={p.color} /> }}
      />
      <Tabs.Screen
        name="account/index"
        options={{ title: "Account", tabBarIcon: (p) => <CircleUserRound size={22} color={p.color} /> }}
      />
    </Tabs>
  );
}
