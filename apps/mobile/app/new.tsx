import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useSelector } from "@legendapp/state/react";
import type { AgentId } from "@litter/shared";
import {
  allDevices,
  capsFor,
  pendingTurns$,
  reposByActivity,
  sessions$,
  sessionsForRepo,
} from "@/state/stores";
import { Composer, type ComposerSubmit } from "@/components/Composer";
import { AgentLogo, agentLabel, cn } from "@/ui";
import { effectiveCaps } from "@/ui/agent-meta";

const AGENTS: AgentId[] = ["claude", "codex", "opencode"];

/** Start a new task: pick repo + agent, then compose with the full controls. */
export default function NewTaskScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const repos = useSelector(() => reposByActivity());
  const [repoId, setRepoId] = useState<string | null>(repos[0]?.id ?? null);
  const [agent, setAgent] = useState<AgentId>("claude");

  const reportedCaps = useSelector(() => capsFor(agent));
  const caps = effectiveCaps(agent, reportedCaps);

  // derive a cwd + host to launch in from the repo's most recent session
  const cwd = useMemo(() => {
    if (!repoId) return null;
    return sessionsForRepo(repoId).find((s) => s.cwd)?.cwd ?? null;
  }, [repoId]);
  const hostId = useMemo(() => {
    const rs = repoId ? sessionsForRepo(repoId)[0] : undefined;
    return rs?.hostId ?? allDevices()[0]?.id;
  }, [repoId]);

  const launch = (s: ComposerSubmit) => {
    const id = `new_${Date.now()}`;
    const nowIso = new Date().toISOString();
    const repoSession = repoId ? sessionsForRepo(repoId)[0] : undefined;
    const device = repoSession ? { id: repoSession.hostId, name: repoSession.host } : allDevices()[0];
    sessions$[id].set({
      id,
      repoId: repoId ?? "repo:Scratch",
      hostId: device?.id ?? "dev:local",
      host: device?.name ?? "local",
      agent,
      title: s.text.slice(0, 100) || "New task",
      branch: null,
      worktree: null,
      cwd,
      isLive: true,
      activity: "queued",
      needsAttention: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    // Hand the first turn (prompt + mode/effort/images) to the session screen.
    pendingTurns$[id].set(s);
    router.replace(`/session/${id}`);
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-bg"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ paddingTop: insets.top + 8 }}
    >
      <View className="flex-row items-center justify-between px-4 pb-3">
        <Text className="text-[22px] font-bold text-fg">New task</Text>
        <Pressable onPress={() => router.back()} className="active:opacity-60">
          <Text className="text-[15px] text-fg-muted">Cancel</Text>
        </Pressable>
      </View>

      <ScrollView className="flex-1 px-4" contentContainerStyle={{ gap: 16, paddingBottom: 16 }}>
        <Field label="Repository">
          <View className="flex-row flex-wrap gap-2">
            {repos.map((r) => (
              <Chip key={r.id} active={repoId === r.id} onPress={() => setRepoId(r.id)} label={r.name} />
            ))}
          </View>
        </Field>

        <Field label="Agent">
          <View className="flex-row flex-wrap gap-2">
            {AGENTS.map((a) => (
              <Pressable
                key={a}
                onPress={() => setAgent(a)}
                className={cn(
                  "flex-row items-center gap-1.5 rounded-full border px-3 py-1.5",
                  agent === a ? "border-accent bg-accent-soft" : "border-border bg-surface",
                )}
              >
                <AgentLogo agent={a} size={14} />
                <Text className={cn("text-[13px]", agent === a ? "text-accent" : "text-fg-muted")}>
                  {agentLabel(a)}
                </Text>
              </Pressable>
            ))}
          </View>
        </Field>
      </ScrollView>

      {/* Same composer as the session view — mode / effort / image / slash */}
      <View style={{ paddingBottom: insets.bottom + 8 }} className="border-t border-border bg-bg-elevated px-3 pt-2">
        <Composer
          agent={agent}
          caps={caps}
          hostId={hostId}
          cwd={cwd}
          placeholder="Describe the task… e.g. Add idempotent retry to the webhook handler"
          onSubmit={launch}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="text-[12px] uppercase tracking-wide text-fg-faint">{label}</Text>
      {children}
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className={cn("rounded-full border px-3.5 py-1.5", active ? "border-accent bg-accent-soft" : "border-border bg-surface")}>
      <Text className={cn("text-[13px]", active ? "text-accent" : "text-fg-muted")}>{label}</Text>
    </Pressable>
  );
}
