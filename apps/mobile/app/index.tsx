import { Redirect } from "expo-router";

import { useSession } from "../src/data/provider";
import { Screen } from "../src/ui";
import { Skeleton } from "../src/ui/skeleton";

export default function Index() {
  const session = useSession();
  if (session.isLoading) {
    return (
      <Screen scroll={false}>
        <Skeleton height={120} radius={24} />
        <Skeleton height={14} width="60%" />
      </Screen>
    );
  }
  return <Redirect href={session.data ? "/(tabs)/home" : "/(auth)/welcome"} />;
}
