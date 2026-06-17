import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSelector } from "@legendapp/state/react";
import { allAgentsInUse, allDevices, filters$ } from "@/state/stores";
import { agentLabel, AgentLogo, AGENT_HEX, cn, COLOR, DeviceIcon } from "@/ui";

/** The one and only filter surface — a thumb-zone bottom sheet holding every
 *  filter dimension (status · device · agent). */
export function FilterSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const devices = useSelector(() => allDevices());
  const agents = useSelector(() => allAgentsInUse());
  const f = useSelector(() => filters$.get());

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/50" onPress={onClose} />
      <View
        style={{ paddingBottom: insets.bottom + 16 }}
        className="rounded-t-3xl border-t border-border bg-bg-elevated px-4 pt-3"
      >
        <View className="mb-3 h-1 w-10 self-center rounded-full bg-border" />
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-[18px] font-bold text-fg">Filter</Text>
          <Pressable onPress={() => filters$.set({ device: null, agent: null, needsOnly: false })}>
            <Text className="text-[13px] text-fg-muted">Clear all</Text>
          </Pressable>
        </View>

        <Group label="Show">
          <Chip label="Everything" active={!f.needsOnly} onPress={() => filters$.needsOnly.set(false)} />
          <Chip label="Needs you" active={f.needsOnly} onPress={() => filters$.needsOnly.set(true)} />
        </Group>

        {devices.length > 1 ? (
          <Group label="Device">
            {devices.map((d) => {
              const active = f.device === d.id;
              return (
                <Chip
                  key={d.id}
                  label={d.name}
                  active={active}
                  onPress={() => filters$.device.set(active ? null : d.id)}
                  icon={<DeviceIcon name={d.name} color={active ? COLOR.accent : COLOR.fgMuted} />}
                />
              );
            })}
          </Group>
        ) : null}

        {agents.length > 1 ? (
          <Group label="Agent">
            {agents.map((a) => {
              const active = f.agent === a;
              return (
                <Chip
                  key={a}
                  label={agentLabel(a)}
                  active={active}
                  onPress={() => filters$.agent.set(active ? null : a)}
                  icon={<AgentLogo agent={a} color={active ? COLOR.accent : AGENT_HEX[a] ?? COLOR.fgMuted} />}
                />
              );
            })}
          </Group>
        ) : null}

        <Pressable
          onPress={onClose}
          className="active:opacity-90 mt-4 h-12 items-center justify-center rounded-2xl bg-accent"
        >
          <Text className="text-[15px] font-semibold text-white">Done</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="mb-3 gap-2">
      <Text className="text-[12px] uppercase tracking-wide text-fg-faint">{label}</Text>
      <View className="flex-row flex-wrap gap-2">{children}</View>
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
  icon,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        "h-9 flex-row items-center gap-1.5 rounded-full border px-3.5",
        active ? "border-accent/60 bg-accent-soft" : "border-border bg-surface-alt active:bg-surface-hover",
      )}
    >
      {icon}
      <Text className={cn("text-[13px] font-medium", active ? "text-accent" : "text-fg-muted")}>{label}</Text>
    </Pressable>
  );
}
