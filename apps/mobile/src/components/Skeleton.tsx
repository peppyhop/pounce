import { Text, View } from "react-native";
import { Skeleton } from "boneyard-js/native";

/**
 * A static card-shaped template. Boneyard renders it, snapshots the native
 * layout, and shows pixel-perfect bones in its place while `loading`. The
 * placeholder text/sizes mirror a real SessionCard so the bones line up.
 */
function CardTemplate() {
  return (
    <View className="rounded-2xl border border-border bg-surface p-3.5">
      <View className="flex-row items-center gap-2">
        <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: "#777" }} />
        <Text className="flex-1 text-[15px] font-semibold text-fg" numberOfLines={1}>
          Refactor the auth flow
        </Text>
        <View style={{ width: 50, height: 18, borderRadius: 9, backgroundColor: "#777" }} />
      </View>
      <Text className="mt-1.5 text-[12px] text-fg-muted">mac-mini · api · feat/oauth-refresh</Text>
      <View className="mt-2 flex-row items-center justify-between">
        <Text className="text-[11px] text-fg-muted">awaiting input</Text>
        <Text className="text-[11px] text-fg-faint">2m</Text>
      </View>
    </View>
  );
}

/** One skeleton card (Boneyard bones of a SessionCard layout). */
export function SessionCardSkeleton() {
  return (
    <Skeleton loading dark darkColor="rgba(255,255,255,0.11)" animate="shimmer">
      <CardTemplate />
    </Skeleton>
  );
}

/** A stack of skeleton cards for the initial load. */
export function SessionListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View className="gap-2.5 px-4 pt-1.5" pointerEvents="none">
      {Array.from({ length: count }).map((_, i) => (
        <SessionCardSkeleton key={i} />
      ))}
    </View>
  );
}

/** One chat-bubble bone, sized/aligned like a real Timeline message. */
function BubbleTemplate({ user, lines }: { user: boolean; lines: 1 | 2 | 3 }) {
  const width = user ? "62%" : "80%";
  return (
    <View style={{ alignItems: user ? "flex-end" : "flex-start" }}>
      <View
        style={{ maxWidth: "86%", width, borderRadius: 16, padding: 10, gap: 6, backgroundColor: "#777" }}
      >
        <Text className="text-[15px] leading-[21px] text-fg">a</Text>
        {lines >= 2 ? <Text className="text-[15px] leading-[21px] text-fg">a</Text> : null}
        {lines >= 3 ? <Text className="text-[15px] leading-[21px] text-fg">a</Text> : null}
      </View>
    </View>
  );
}

/**
 * Chat-shaped bones for the initial history load — alternating bubbles that
 * mirror the Timeline layout, so the skeleton dissolves into real messages.
 */
export function TimelineSkeleton() {
  return (
    <Skeleton loading dark darkColor="rgba(255,255,255,0.11)" animate="shimmer">
      <View className="flex-1 gap-3 px-3 pt-3" pointerEvents="none">
        <BubbleTemplate user={false} lines={2} />
        <BubbleTemplate user lines={1} />
        <BubbleTemplate user={false} lines={3} />
        <BubbleTemplate user={false} lines={1} />
        <BubbleTemplate user lines={2} />
        <BubbleTemplate user={false} lines={2} />
        <BubbleTemplate user lines={1} />
      </View>
    </Skeleton>
  );
}
