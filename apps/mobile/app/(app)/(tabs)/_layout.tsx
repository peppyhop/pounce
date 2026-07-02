import { Tabs } from "expo-router";
import { Platform, type ColorValue } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { AnimatedTabBar } from "@/motion-tabs";
import { PouncePopups } from "@/components/TabPopups";

type IconName = React.ComponentProps<typeof Ionicons>["name"];
const icon =
  (name: IconName) =>
  ({ color, size }: { color: ColorValue; size: number }) => (
    <Ionicons name={name} size={size} color={color as string} />
  );

/**
 * Home / Search / Settings, driven by the motion tab bar. The native bar is
 * collapsed to zero height; AnimatedTabBar draws the floating glass dock and
 * its per-tab morphing popup (see TabPopups).
 */
export default function TabsLayout() {
  return (
    <Tabs
      detachInactiveScreens={Platform.OS !== "ios"}
      screenOptions={{
        headerShown: false,
        // Instant, flash-free tab switches. "shift"/"fade" cross-fade the
        // scenes, which flashes the background during the transition.
        animation: "none",
        lazy: false, // keep all three mounted so a first visit shows no blank frame
        sceneStyle: { backgroundColor: "#0B0B0F" },
        tabBarStyle: {
          height: 0,
          borderTopWidth: 0,
          elevation: 0,
          backgroundColor: "transparent",
          position: "absolute",
        },
      }}
      tabBar={(props) => (
        <AnimatedTabBar {...(props as unknown as BottomTabBarProps)} renderPopupBody={PouncePopups} />
      )}
    >
      <Tabs.Screen name="index" options={{ tabBarLabel: "Home", tabBarIcon: icon("home") }} />
      <Tabs.Screen name="search" options={{ tabBarLabel: "Search", tabBarIcon: icon("search") }} />
      <Tabs.Screen name="settings" options={{ tabBarLabel: "Settings", tabBarIcon: icon("settings-sharp") }} />
    </Tabs>
  );
}
