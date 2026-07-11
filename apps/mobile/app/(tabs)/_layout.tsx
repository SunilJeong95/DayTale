import { Tabs } from "expo-router";

/**
 * app/(tabs)/_layout.tsx — OWNED BY WS-B (Auth & shell).
 *
 * Bottom tabs: Feed / Write / Library / Profile (plan §4). M0 scaffolds a
 * working tab bar with default icons/labels so the 4 stub screens are
 * reachable; WS-B/feature workstreams (WS-E/F/G/H/I) can refine icons,
 * titles, and add auth-gating around this layout.
 */
export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: "피드" }} />
      <Tabs.Screen name="write" options={{ title: "일기" }} />
      <Tabs.Screen name="library" options={{ title: "라이브러리" }} />
      <Tabs.Screen name="profile" options={{ title: "프로필" }} />
    </Tabs>
  );
}
