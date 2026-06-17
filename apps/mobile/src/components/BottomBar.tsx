import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { CopilotStep, walkthroughable } from "react-native-copilot";
import { cn, COLOR } from "@/ui";

const Walk = walkthroughable(View);

/**
 * The ＋ / voice button. When voice is available it periodically "winks" — the
 * ＋ morphs into a 🎤 with a ring ripple — so even at rest the user sees it's
 * voice-capable. Pressing-and-holding does the same morph + grows the ring,
 * confirming "hold to talk". Tap = new task.
 */
function NewButton({ onPress, onLongPress }: { onPress: () => void; onLongPress?: () => void }) {
  const ripple = useRef(new Animated.Value(0)).current; // ring pulse
  const hint = useRef(new Animated.Value(0)).current; // idle ＋→🎤 wink
  const held = useRef(new Animated.Value(0)).current; // press-and-hold

  useEffect(() => {
    if (!onLongPress) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(2200),
        Animated.parallel([
          Animated.timing(hint, { toValue: 1, duration: 420, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(ripple, { toValue: 1, duration: 1200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
            Animated.timing(ripple, { toValue: 0, duration: 0, useNativeDriver: true }),
          ]),
        ]),
        Animated.delay(650),
        Animated.timing(hint, { toValue: 0, duration: 380, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [hint, ripple, onLongPress]);

  const press = (to: number) =>
    Animated.timing(held, { toValue: to, duration: to ? 320 : 160, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();

  // The icon shows 🎤 when either winking (hint) or held; ＋ otherwise.
  const mic = Animated.add(hint, held);
  const ringScale = Animated.add(
    ripple.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] }),
    held.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] }),
  );
  const ringStyle = {
    transform: [{ scale: ringScale }],
    opacity: Animated.add(
      ripple.interpolate({ inputRange: [0, 1], outputRange: [0.32, 0] }),
      held.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] }),
    ),
  };
  const btnStyle = { transform: [{ scale: held.interpolate({ inputRange: [0, 1], outputRange: [1, 0.92] }) }] };
  const plusStyle = { opacity: mic.interpolate({ inputRange: [0, 1], outputRange: [1, 0], extrapolate: "clamp" }) };
  const micStyle = { opacity: mic.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: "clamp" }) };

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => press(1)}
      onPressOut={() => press(0)}
      delayLongPress={320}
      className="h-14 w-14 items-center justify-center"
    >
      {onLongPress ? (
        <Animated.View style={ringStyle} pointerEvents="none" className="absolute h-14 w-14 rounded-full border-2 border-accent bg-accent/30" />
      ) : null}
      <Animated.View style={btnStyle} className="h-14 w-14 items-center justify-center rounded-full bg-accent">
        <Animated.View style={plusStyle} className="absolute">
          <Ionicons name="add" size={30} color="#fff" />
        </Animated.View>
        <Animated.View style={micStyle} className="absolute">
          <Ionicons name="mic" size={24} color="#fff" />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

/**
 * The single control surface — floats in the thumb zone. Three jobs only:
 * Find · New · Filter. Everything else is reachable from inside a thread.
 */
export function BottomBar({
  onFind,
  onNew,
  onNewLongPress,
  onFilter,
  filterActive,
}: {
  onFind: () => void;
  onNew: () => void;
  onNewLongPress?: () => void;
  onFilter: () => void;
  filterActive: number;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={{ paddingBottom: insets.bottom + 8 }} className="absolute inset-x-0 bottom-0 items-center">
      <View className="flex-row items-center gap-2 rounded-full border border-border bg-bg-elevated px-2 py-2 shadow-lg">
        <CopilotStep order={2} name="find" text="Find any thread fast — search by name, repo, or branch.">
          <Walk>
            <Side icon="search" label="Find" onPress={onFind} />
          </Walk>
        </CopilotStep>
        <CopilotStep order={1} name="new" text="Start a task here — tap to type, or hold to talk.">
          <Walk>
            <NewButton onPress={onNew} onLongPress={onNewLongPress} />
          </Walk>
        </CopilotStep>
        <CopilotStep order={3} name="filter" text="Filter by device, agent, or just what needs you.">
          <Walk>
            <Side icon="options-outline" label="Filter" onPress={onFilter} badge={filterActive} />
          </Walk>
        </CopilotStep>
      </View>
    </View>
  );
}

function Side({
  icon,
  label,
  onPress,
  badge = 0,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  badge?: number;
}) {
  return (
    <Pressable onPress={onPress} className="active:opacity-70 h-14 w-16 items-center justify-center gap-0.5">
      <View>
        <Ionicons name={icon} size={22} color={badge ? COLOR.accent : COLOR.fgMuted} />
        {badge ? (
          <View className="absolute -right-2 -top-1 h-4 min-w-[16px] items-center justify-center rounded-full bg-accent px-1">
            <Text className="text-[10px] font-bold text-white">{badge}</Text>
          </View>
        ) : null}
      </View>
      <Text className={cn("text-[11px]", badge ? "text-accent" : "text-fg-faint")}>{label}</Text>
    </Pressable>
  );
}
