import { Redirect } from "expo-router";

// PBS-BUG-037: unmatched /profile/* routes (including management screens
// unregistered for the current role) redirect to the safe profile home
// instead of rendering expo-router's default 404 screen. This screen itself
// performs no data fetching.
export default function ProfileNotFound() {
  return <Redirect href="/(app)/profile" />;
}
