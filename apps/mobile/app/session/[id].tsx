import { useCallback, useEffect, useRef, useState } from "react";
import { ActionSheetIOS, Pressable, Text, View } from "react-native";
import { KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSelector } from "@legendapp/state/react";
import type { TimelineEvent } from "@litter/shared";
import { Timeline } from "@/components/Timeline";
import { TimelineSkeleton } from "@/components/Skeleton";
import { Composer, type ComposerSubmit } from "@/components/Composer";
import { useTimeline } from "@/hooks/useTimeline";
import { capsFor, connection$, pendingTurns$, sessions$ } from "@/state/stores";
import { fetchMessages, interruptTurn, streamLiveMessage } from "@/services/bridge";
import { Ionicons } from "@expo/vector-icons";
import { ActivityDot, ACTIVITY_LABEL, AgentLogo, cn, COLOR } from "@/ui";
import { effectiveCaps } from "@/ui/agent-meta";

function mergeById(cur: TimelineEvent[], inc: TimelineEvent[]): TimelineEvent[] {
  const out = cur.slice();
  const idx = new Map(out.map((e, i) => [e.id, i] as const));
  for (const ev of inc) {
    const i = idx.get(ev.id);
    if (i != null) out[i] = ev;
    else { idx.set(ev.id, out.length); out.push(ev); }
  }
  return out;
}

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [stopping, setStopping] = useState(false);

  const session = useSelector(() => sessions$[id!].get());
  // "live" = a real bridge is in use (not demo). Gating history on the transient
  // connection *status* meant a flaky/settling reconnect left threads blank even
  // though the host was reachable; fetchMessages already degrades gracefully.
  const live = useSelector(() => !connection$.demo.get());
  const reportedCaps = useSelector(() => (session ? capsFor(session.agent) : null));

  const demoTl = useTimeline(id!, undefined, !live);
  const [liveEvents, setLiveEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!live || !session?.id) return;
    let cancelled = false;
    setLoading(true);
    fetchMessages(session.hostId, session.agent, session.id)
      .then((ev) => !cancelled && setLiveEvents(ev))
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [live, session?.id, session?.agent, session?.hostId]);

  const events = live ? liveEvents : demoTl.events;

  // Errors propagate so the Composer can restore the user's draft.
  const onSubmit = useCallback(async (s: ComposerSubmit) => {
    if (!session) return;
    setSending(true);
    try {
      if (live) {
        const optimistic: TimelineEvent = {
          id: `opt:${Date.now()}`,
          conversationId: session.id,
          seq: Number.MAX_SAFE_INTEGER,
          ts: new Date().toISOString(),
          type: "user_message",
          text: s.text || (s.images.length ? "🖼️ Image" : ""),
        };
        setLiveEvents((e) => mergeById(e, [optimistic]));
        const { threadId } = await streamLiveMessage(
          session.hostId,
          session.agent,
          session.id,
          session.cwd,
          s.text,
          (ev) => setLiveEvents((e) => mergeById(e, [ev])),
          { images: s.images, permissionMode: s.permissionMode, reasoningEffort: s.reasoningEffort },
        );
        if (threadId) setLiveEvents(await fetchMessages(session.hostId, session.agent, threadId));
      } else {
        const { getRuntime } = await import("@/services/runtime");
        const rt = await getRuntime();
        await rt.sendMessage({
          conversation: { id: session.id, agent: session.agent, threadId: session.id } as never,
          project: { path: session.cwd ?? "" } as never,
          text: s.text,
        });
      }
    } finally {
      setSending(false);
    }
  }, [session, live]);

  const stop = useCallback(async () => {
    if (!session) return;
    setStopping(true);
    try {
      await interruptTurn(session.hostId, session.agent, session.id);
    } finally {
      setStopping(false);
    }
  }, [session]);

  // Fire the first turn handed off from the New-task composer (once).
  const firedPending = useRef(false);
  useEffect(() => {
    if (firedPending.current || !session) return;
    const pending = pendingTurns$[id!].get();
    if (!pending) return;
    firedPending.current = true;
    pendingTurns$[id!].delete();
    void Promise.resolve(onSubmit(pending)).catch(() => {});
  }, [session, id, onSubmit]);

  if (!session) {
    return (
      <View className="flex-1 items-center justify-center bg-bg">
        <Text className="text-fg-muted">Session not found.</Text>
      </View>
    );
  }

  const canSteer = session.isLive;
  const caps = effectiveCaps(session.agent, reportedCaps);
  const running = sending || session.activity === "running" || session.activity === "streaming";

  // All session actions in one thumb-zone sheet (slides up from the bottom).
  const openActions = () => {
    const acts: { label: string; run: () => void }[] = [];
    if (running) acts.push({ label: "Stop agent", run: () => void stop() });
    if (session.cwd) {
      acts.push({ label: "View changes", run: () => router.push(`/changes?id=${session.id}`) });
      acts.push({ label: "Open terminal", run: () => router.push(`/terminal?id=${session.id}`) });
    }
    if (!acts.length) return;
    const labels = acts.map((a) => a.label);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: session.title,
        options: [...labels, "Cancel"],
        cancelButtonIndex: labels.length,
        destructiveButtonIndex: running ? 0 : undefined,
      },
      (i) => { if (i >= 0 && i < acts.length) acts[i].run(); },
    );
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-bg"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <Stack.Screen options={{ headerShown: false }} />
      {/* Header */}
      <View style={{ paddingTop: insets.top }} className="border-b border-border bg-bg-elevated">
        <View className="flex-row items-center gap-2 px-3 pb-2.5 pt-1">
          <Pressable onPress={() => router.back()} className="active:opacity-60 h-9 w-9 items-center justify-center">
            <Text className="text-[22px] text-fg">‹</Text>
          </Pressable>
          <View className="flex-1">
            <Text numberOfLines={1} className="text-[15px] font-semibold text-fg">{session.title}</Text>
            <View className="mt-0.5 flex-row items-center gap-2">
              <ActivityDot status={session.activity} size={7} />
              <Text className="text-[12px] text-fg-muted">{ACTIVITY_LABEL[session.activity]}</Text>
              {session.branch ? <Text numberOfLines={1} className="font-mono text-[11px] text-fg-faint">⎇ {session.branch}</Text> : null}
            </View>
          </View>
          <AgentLogo agent={session.agent} size={16} />
          <Pressable
            onPress={openActions}
            className="active:opacity-60 h-9 w-9 items-center justify-center"
          >
            <Ionicons
              name="ellipsis-horizontal"
              size={20}
              color={running ? COLOR.danger : COLOR.fgMuted}
            />
          </Pressable>
        </View>
      </View>

      <View className="flex-1">
        {loading && events.length === 0 ? (
          <TimelineSkeleton />
        ) : (
          <Timeline events={events} agent={session.agent} />
        )}
      </View>

      {/* Composer */}
      <View style={{ paddingBottom: insets.bottom + 8 }} className="border-t border-border bg-bg-elevated px-3 pt-2">
        {!canSteer ? (
          <Text className="px-1 pb-2 text-[12px] text-fg-faint">
            Archived session — worktree was removed. Read-only.
          </Text>
        ) : null}
        <Composer
          agent={session.agent}
          caps={caps}
          disabled={!canSteer}
          sending={sending}
          hostId={session.hostId}
          cwd={session.cwd}
          onSubmit={onSubmit}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
