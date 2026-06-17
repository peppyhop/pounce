import { Stack } from "expo-router";

// One Home — no tab bar. Find/Filter/New live in the in-screen bottom bar.
export default function HomeLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
