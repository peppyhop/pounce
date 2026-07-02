import { useMemo, useState } from "react";
import { Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LegendList } from "@legendapp/list/react-native";
import { useSelector } from "@legendapp/state/react";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { CopilotStep, useCopilot, walkthroughable } from "react-native-copilot";
import type { Session } from "@litter/shared";
import {
  activeFilterCount,
  applyFilters,
  connection$,
  filters$,
  rawSessions,
  repositories$,
} from "@/state/stores";
import { SessionCard } from "@/components/SessionCard";
import { SessionListSkeleton } from "@/components/Skeleton";
import { COLOR } from "@/ui";
import { refreshLive } from "@/services/runtime";
import { enableDemo } from "@/services/demo";

const WalkView = walkthroughable(View);

const needsYou = (s: Session) =>
  s.needsAttention || s.activity === "failed" || s.activity === "awaiting_input";

/** A directory header, or one session beneath it. */
type Row =
  | { type: "header"; repoId: string; name: string; count: number; attention: number }
  | { type: "session"; session: Session };

/** Sort order: needs-you → running → other live → archived; newest within each. */
function rank(s: Session): number {
  if (needsYou(s)) return 0;
  if (s.activity === "running" || s.activity === "streaming") return 1;
  if (s.isLive) return 2;
  return 3;
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [refreshing, setRefreshing] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleGroup = (repoId: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(repoId) ? next.delete(repoId) : next.add(repoId);
      return next;
    });

  const raw = useSelector(() => rawSessions());
  const f = useSelector(() => filters$.get());
  const repos = useSelector(() => repositories$.get());
  const status = useSelector(() => connection$.status.get());
  const demo = useSelector(() => connection$.demo.get());
  const filterCount = useSelector(() => activeFilterCount());

  // Opt into the sample workspace, then walk the user through it.
  const { start } = useCopilot();
  const exploreWithSampleData = () => {
    enableDemo();
    setTimeout(() => start(), 700);
  };

  const connected = status === "connected";
  const loading = status === "connecting" || status === "reconnecting";

  const scoped = useMemo(() => applyFilters(raw), [raw, f.device, f.agent]);
  const attentionCount = useMemo(() => scoped.filter(needsYou).length, [scoped]);
  // Smart default: "needs you" narrows to attention items, but when nothing
  // needs you we show everything rather than an empty screen.
  const effectiveNeedsOnly = f.needsOnly && attentionCount > 0;

  const data = useMemo<Session[]>(() => {
    let list = scoped;
    if (effectiveNeedsOnly) list = list.filter(needsYou);
    return [...list].sort((a, b) => rank(a) - rank(b) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }, [scoped, effectiveNeedsOnly]);

  // Group the (already ranked) sessions under their directory. Directories with
  // something needing you float to the top; newest activity breaks ties.
  const rows = useMemo<Row[]>(() => {
    const groups = new Map<string, Session[]>();
    for (const s of data) {
      const arr = groups.get(s.repoId);
      if (arr) arr.push(s);
      else groups.set(s.repoId, [s]);
    }
    const ordered = [...groups.entries()].sort((a, b) => {
      const ra = Math.min(...a[1].map(rank));
      const rb = Math.min(...b[1].map(rank));
      if (ra !== rb) return ra - rb;
      const ta = Math.max(...a[1].map((s) => Date.parse(s.updatedAt)));
      const tb = Math.max(...b[1].map((s) => Date.parse(s.updatedAt)));
      return tb - ta;
    });
    const out: Row[] = [];
    for (const [repoId, list] of ordered) {
      out.push({
        type: "header",
        repoId,
        name: repos[repoId]?.name ?? repoId.replace(/^repo:/, ""),
        count: list.length,
        attention: list.filter(needsYou).length,
      });
      if (!collapsed.has(repoId)) for (const s of list) out.push({ type: "session", session: s });
    }
    return out;
  }, [data, repos, collapsed]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await refreshLive(true); } finally { setRefreshing(false); }
  };

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      {/* Glance header */}
      <View className="flex-row items-end justify-between px-4 pb-2 pt-1">
        <CopilotStep order={2} name="home" text="Your threads live here, grouped by the folder they run in. Search and Settings are in the bar below.">
          <WalkView>
            <Text className="text-[26px] font-bold text-fg">Pounce</Text>
            <Pressable onPress={() => router.push("/settings")} className="active:opacity-60">
              <Text className="text-[13px] text-fg-faint">
                {demo
                  ? "Exploring sample data · tap to sync"
                  : !connected && !loading
                    ? "Tap to sync a device"
                    : loading
                      ? "Syncing…"
                      : attentionCount > 0
                        ? `${attentionCount} need${attentionCount === 1 ? "s" : ""} you`
                        : "All caught up"}
                {filterCount ? " · filtered" : ""}
              </Text>
            </Pressable>
          </WalkView>
        </CopilotStep>
        <CopilotStep order={1} name="new" text="Start a task here — describe it, or browse to the folder it should run in.">
          <WalkView>
            <Pressable onPress={() => router.push("/new")} className="active:opacity-80 h-9 flex-row items-center gap-1 rounded-full bg-accent px-3.5">
              <Ionicons name="add" size={17} color="#fff" />
              <Text className="text-[14px] font-semibold text-white">New</Text>
            </Pressable>
          </WalkView>
        </CopilotStep>
      </View>

      <LegendList
        data={rows}
        keyExtractor={(r) => (r.type === "header" ? `h:${r.repoId}` : r.session.id)}
        renderItem={({ item }) =>
          item.type === "header" ? (
            <DirHeader
              name={item.name}
              count={item.count}
              attention={item.attention}
              collapsed={collapsed.has(item.repoId)}
              onPress={() => toggleGroup(item.repoId)}
            />
          ) : (
            <View className="px-4 pb-2.5">
              <SessionCard session={item.session} />
            </View>
          )
        }
        estimatedItemSize={104}
        getItemType={(r) => r.type}
        recycleItems
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLOR.accent} />}
        ListEmptyComponent={
          loading ? (
            <SessionListSkeleton />
          ) : !connected ? (
            <View className="items-center px-8 py-20">
              <Text className="text-[40px]">🐾</Text>
              <Text className="mt-3 text-center text-[15px] font-semibold text-fg">Connect your computer</Text>
              <Text className="mt-1 text-center text-[13px] text-fg-muted">
                Run Pounce Bridge on your Mac and scan the code to see your agents here.
              </Text>
              <Pressable
                onPress={() => router.push("/settings")}
                className="active:opacity-80 mt-5 rounded-full bg-accent px-5 py-2.5"
              >
                <Text className="text-[14px] font-semibold text-white">Sync a device</Text>
              </Pressable>
              <Pressable onPress={exploreWithSampleData} className="active:opacity-60 mt-3 py-1">
                <Text className="text-[13px] text-accent">Explore with sample data</Text>
              </Pressable>
            </View>
          ) : (
            <View className="items-center px-8 py-20">
              <Text className="text-[40px]">🐾</Text>
              <Text className="mt-3 text-center text-[15px] font-semibold text-fg">All caught up</Text>
              <Text className="mt-1 text-center text-[13px] text-fg-muted">Nothing needs you right now.</Text>
            </View>
          )
        }
        contentContainerStyle={{ paddingTop: 6, paddingBottom: insets.bottom + 120 }}
      />
    </View>
  );
}

/** Collapsible directory section header on the Home list. */
function DirHeader({
  name,
  count,
  attention,
  collapsed,
  onPress,
}: {
  name: string;
  count: number;
  attention: number;
  collapsed: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="active:opacity-70 flex-row items-center gap-2 px-4 pb-1.5 pt-3"
    >
      <Ionicons name={collapsed ? "chevron-forward" : "chevron-down"} size={13} color={COLOR.fgFaint} />
      <Ionicons name="folder-outline" size={13} color={COLOR.fgFaint} />
      <Text numberOfLines={1} className="flex-1 text-[13px] font-semibold text-fg-muted">
        {name}
      </Text>
      {attention > 0 ? (
        <View className="rounded-full bg-warning/15 px-2 py-0.5">
          <Text className="text-[11px] font-semibold text-warning">{attention}</Text>
        </View>
      ) : null}
      <Text className="text-[12px] text-fg-faint">{count}</Text>
    </Pressable>
  );
}
