import { Search } from "lucide-react-native";
import * as React from "react";
import { TextInput, View } from "react-native";
import { humanizeStatus } from "@rentbrown/utils";

import { useContent } from "../../../src/data/hooks";
import { t } from "../../../src/theme";
import {
  Card,
  EmptyState,
  HeaderBar,
  ListRow,
  Screen,
  SegmentedControl,
  SkeletonCard,
  StatePanel,
  useToast,
} from "../../../src/ui";

const CATS = ["ALL", "GETTING_STARTED", "INVESTING", "WALLET", "SECURITY", "REFERRALS"] as const;

export default function Help() {
  const content = useContent();
  const { toast } = useToast();
  const [query, setQuery] = React.useState("");
  const [cat, setCat] = React.useState<(typeof CATS)[number]>("ALL");

  const articles = (content.data?.help ?? []).filter(
    (a) =>
      (cat === "ALL" || a.category === cat) &&
      (!query.trim() || a.title.toLowerCase().includes(query.toLowerCase())),
  );

  return (
    <Screen bottomPad={110}>
      <HeaderBar back title="Help & tutorials" />
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          backgroundColor: t.bg.subtle,
          borderWidth: 1,
          borderColor: t.border.default,
          borderRadius: 12,
          paddingHorizontal: 12,
          minHeight: 44,
        }}
      >
        <Search size={16} color={t.text.tertiary} />
        <TextInput
          accessibilityLabel="Search help"
          placeholder="Search articles"
          placeholderTextColor={t.text.tertiary}
          value={query}
          onChangeText={setQuery}
          style={{ flex: 1, fontSize: 14, color: t.text.primary }}
        />
      </View>
      <SegmentedControl
        options={CATS.map((c) => ({ value: c, label: c === "ALL" ? "All" : humanizeStatus(c) }))}
        value={cat}
        onChange={setCat}
      />
      {content.isLoading ? (
        <SkeletonCard lines={4} />
      ) : articles.length === 0 ? (
        <EmptyState title="No articles match" />
      ) : (
        <Card padded={false} style={{ paddingVertical: 4 }}>
          {articles.map((a) => (
            <ListRow
              key={a.id}
              title={a.title}
              caption={`${a.summary} · ${a.readMinutes} min read`}
              onPress={() => toast("Article content arrives with the content phase")}
              style={{ paddingHorizontal: 14 }}
            />
          ))}
        </Card>
      )}
      <StatePanel
        tone="info"
        title="Need more help?"
        body="Send us a message and the team will respond."
        actionLabel="Contact support"
        onAction={() => toast("Support arrives with the backend phase")}
      />
    </Screen>
  );
}
