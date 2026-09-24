import { Search, SlidersHorizontal } from "lucide-react-native";
import * as React from "react";
import { Pressable, TextInput, View } from "react-native";
import type { InvestmentRoundStatus, OpportunityFilter } from "@rentbrown/types";

import { OpportunityCard } from "../../../src/components/opportunity-card";
import { useOpportunities } from "../../../src/data/hooks";
import { t } from "../../../src/theme";
import {
  BottomSheet,
  EmptyState,
  HeaderBar,
  ListRow,
  Screen,
  SegmentedControl,
  SkeletonCard,
} from "../../../src/ui";

type Filter = "ALL" | "OPEN" | "NEARING_CAPACITY" | "SOLD_OUT" | "SCHEDULED";
type Sort = NonNullable<OpportunityFilter["sort"]>;

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "OPEN", label: "Open" },
  { value: "NEARING_CAPACITY", label: "Nearing capacity" },
  { value: "SOLD_OUT", label: "Sold out" },
  { value: "SCHEDULED", label: "Coming soon" },
];

const SORTS: Array<{ value: Sort; label: string }> = [
  { value: "NEWEST", label: "Newest" },
  { value: "CLOSING_SOON", label: "Closing soon" },
  { value: "ROI", label: "Highest return" },
  { value: "SLOT_PRICE", label: "Slot price" },
];

export default function Explore() {
  const opportunities = useOpportunities();
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("ALL");
  const [sort, setSort] = React.useState<Sort>("NEWEST");
  const [sortOpen, setSortOpen] = React.useState(false);

  const list = React.useMemo(() => {
    let items = opportunities.data ?? [];
    if (filter !== "ALL") items = items.filter((o) => o.round.status === (filter as InvestmentRoundStatus));
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      items = items.filter(
        (o) => o.property.name.toLowerCase().includes(q) || o.property.location.label.toLowerCase().includes(q),
      );
    }
    const sorted = [...items];
    if (sort === "ROI") sorted.sort((a, b) => b.plan.roiBps - a.plan.roiBps);
    if (sort === "SLOT_PRICE") sorted.sort((a, b) => a.plan.slotPrice - b.plan.slotPrice);
    if (sort === "CLOSING_SOON") sorted.sort((a, b) => a.round.closesAt.localeCompare(b.round.closesAt));
    return sorted;
  }, [opportunities.data, filter, query, sort]);

  return (
    <Screen bottomPad={110}>
      <HeaderBar large title="Explore" eyebrow="Open investment rounds" />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View
          style={{
            flex: 1,
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
            accessibilityLabel="Search opportunities"
            placeholder="Search properties or areas"
            placeholderTextColor={t.text.tertiary}
            value={query}
            onChangeText={setQuery}
            style={{ flex: 1, fontSize: 14, color: t.text.primary }}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sort"
          onPress={() => setSortOpen(true)}
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: t.border.default,
            backgroundColor: t.bg.surface,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <SlidersHorizontal size={16} color={t.text.primary} />
        </Pressable>
      </View>
      <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} />
      {opportunities.isLoading ? (
        <>
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
        </>
      ) : list.length === 0 ? (
        <EmptyState
          title={filter === "ALL" && !query ? "No opportunities right now" : "Nothing matches"}
          body={filter === "ALL" && !query ? "New rounds open as properties are onboarded." : "Try a different filter or search."}
          actionLabel={filter !== "ALL" || query ? "Clear filters" : undefined}
          onAction={() => {
            setFilter("ALL");
            setQuery("");
          }}
        />
      ) : (
        list.map((o) => <OpportunityCard key={o.round.id} opportunity={o} />)
      )}
      <BottomSheet open={sortOpen} onClose={() => setSortOpen(false)}>
        <View style={{ gap: 4 }}>
          {SORTS.map((s) => (
            <ListRow
              key={s.value}
              title={s.label}
              chevron={false}
              right={sort === s.value ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.action.primary }} /> : undefined}
              onPress={() => {
                setSort(s.value);
                setSortOpen(false);
              }}
            />
          ))}
        </View>
      </BottomSheet>
    </Screen>
  );
}
