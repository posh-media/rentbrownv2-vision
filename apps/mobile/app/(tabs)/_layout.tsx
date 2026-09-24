import { Tabs } from "expo-router";
import { Building2, CircleUserRound, Compass, House, WalletCards } from "lucide-react-native";
import * as React from "react";

import { TabBar } from "../../src/ui";

export default function TabsLayout() {
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
