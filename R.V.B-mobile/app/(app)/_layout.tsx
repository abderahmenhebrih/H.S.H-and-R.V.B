import { Stack } from "expo-router";

// Authenticated stack. Tabs (Chats / Profile / Search / Settings) render the
// bottom bar; the individual conversation chat/[id] is a sibling Stack screen
// OUTSIDE the Tabs presentation, so the bottom bar disappears completely inside
// an open conversation with no tabBarStyle hacks and no transition flash.
// Hardware Back pops the Stack (conversation -> previous chat screen).
// Route groups do not affect URLs: /(app)/chat/<id> targets are unchanged.
export default function AuthenticatedStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="chat/[id]"
        options={{
          // Dedicated conversation screen: no tabs, gesture + hardware back.
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
        }}
      />
    </Stack>
  );
}
