import { useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { useCopilot } from "react-native-copilot";
import { Alert, KeyboardAvoidingView, Platform, Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LegendList } from "@legendapp/list/react-native";
import { useSelector } from "@legendapp/state/react";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { Session } from "@litter/shared";
import {
  activeFilterCount,
  allAgentsInUse,
  allDevices,
  applyFilters,
  connection$,
  filters$,
  rawSessions,
  repositories$,
} from "@/state/stores";
import { SessionCard } from "@/components/SessionCard";
import { SessionListSkeleton } from "@/components/Skeleton";
import { BottomBar } from "@/components/BottomBar";
import { FilterSheet } from "@/components/FilterSheet";
import { cn, COLOR } from "@/ui";
import { refreshLive } from "@/services/runtime";
import { listenOnce } from "@/services/voice";
import { runVoiceCommand } from "@/services/voiceCommands";

const needsYou = (s: Session) =>
  s.needsAttention || s.activity === "failed" || s.activity === "awaiting_input";

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

  const [finding, setFinding] = useState(false);
  const [query, setQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const raw = useSelector(() => rawSessions());
  const f = useSelector(() => filters$.get());
  const repos = useSelector(() => repositories$.get());
  const status = useSelector(() => connection$.status.get());
  const filterCount = useSelector(() => activeFilterCount());

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
    const t = query.trim().toLowerCase();
    if (finding && t) {
      list = list.filter((s) => {
        const repo = repos[s.repoId]?.name ?? "";
        return (
          s.title.toLowerCase().includes(t) ||
          (s.branch ?? "").toLowerCase().includes(t) ||
          s.host.toLowerCase().includes(t) ||
          s.agent.includes(t) ||
          repo.toLowerCase().includes(t)
        );
      });
    }
    return [...list].sort((a, b) => rank(a) - rank(b) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }, [scoped, effectiveNeedsOnly, finding, query, repos]);

  // First-run walkthrough of the bottom bar.
  const { start } = useCopilot();
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (await SecureStore.getItemAsync("pounce.tourSeen")) return;
      await SecureStore.setItemAsync("pounce.tourSeen", "1");
      setTimeout(() => { if (!cancelled) start(); }, 1000);
    })();
    return () => { cancelled = true; };
  }, [start]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await refreshLive(true); } finally { setRefreshing(false); }
  };

  // Hold ＋ to talk: transcribe → run a navigation/filter command.
  const onVoice = async () => {
    try {
      const transcript = await listenOnce();
      const result = runVoiceCommand(transcript, {
        sessions: raw,
        devices: allDevices(),
        agents: allAgentsInUse(),
        repos,
        navigate: (p) => router.push(p as never),
        setFilter: (next) => filters$.set({ ...filters$.get(), ...next }),
      });
      if (!result.ok) Alert.alert("Voice", result.say);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "voice-permission-denied") {
        Alert.alert("Microphone access needed", "Enable Microphone and Speech Recognition for Pounce in Settings to use voice control.");
      } else {
        Alert.alert("Voice unavailable", "Couldn't start voice control. Try again, or update to the latest build.");
      }
    }
  };

  const closeFind = () => { setFinding(false); setQuery(""); };

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      {/* Glance header */}
      <View className="flex-row items-end justify-between px-4 pb-2 pt-1">
        <View>
          <Text className="text-[26px] font-bold text-fg">Pounce</Text>
          <Pressable onPress={() => router.push("/settings")} className="active:opacity-60">
            <Text className="text-[13px] text-fg-faint">
              {!connected && !loading
                ? "Tap to sync a device"
                : loading
                  ? "Syncing…"
                  : attentionCount > 0
                    ? `${attentionCount} need${attentionCount === 1 ? "s" : ""} you`
                    : "All caught up"}
              {filterCount ? " · filtered" : ""}
            </Text>
          </Pressable>
        </View>
        <Pressable onPress={() => router.push("/settings")} className="active:opacity-60 h-9 w-9 items-center justify-center">
          <Ionicons name="settings-outline" size={20} color={COLOR.fgMuted} />
        </Pressable>
      </View>

      <LegendList
        data={data}
        keyExtractor={(s) => s.id}
        renderItem={({ item }) => (
          <View className="px-4 pb-2.5">
            <SessionCard session={item} />
          </View>
        )}
        estimatedItemSize={104}
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
            </View>
          ) : (
            <View className="items-center px-8 py-20">
              <Text className="text-[40px]">{finding ? "🔍" : "🐾"}</Text>
              <Text className="mt-3 text-center text-[15px] font-semibold text-fg">
                {finding ? "No matches" : "All caught up"}
              </Text>
              <Text className="mt-1 text-center text-[13px] text-fg-muted">
                {finding ? "Try another word." : "Nothing needs you right now."}
              </Text>
            </View>
          )
        }
        contentContainerStyle={{ paddingTop: 6, paddingBottom: insets.bottom + 110 }}
      />

      {finding ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="absolute inset-x-0 bottom-0"
        >
          <View style={{ paddingBottom: insets.bottom + 8 }} className="border-t border-border bg-bg-elevated px-3 pt-2">
            <View className="flex-row items-center gap-2">
              <View className="flex-1 flex-row items-center gap-2 rounded-2xl bg-surface-alt px-3">
                <Ionicons name="search" size={16} color={COLOR.fgFaint} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  autoFocus
                  placeholder="Find a thread…"
                  placeholderTextColor={COLOR.fgFaint}
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="h-11 flex-1 text-[15px] text-fg"
                />
              </View>
              <Pressable onPress={closeFind} className="active:opacity-60 px-1">
                <Text className="text-[15px] text-fg-muted">Cancel</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      ) : (
        <BottomBar
          onFind={() => setFinding(true)}
          onNew={() => router.push("/new")}
          onNewLongPress={onVoice}
          onFilter={() => setFilterOpen(true)}
          filterActive={filterCount}
        />
      )}

      <FilterSheet visible={filterOpen} onClose={() => setFilterOpen(false)} />
    </View>
  );
}
