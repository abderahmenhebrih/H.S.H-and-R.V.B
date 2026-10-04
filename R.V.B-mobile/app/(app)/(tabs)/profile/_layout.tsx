import { Stack, Redirect, useSegments } from "expo-router";
import { useAuthStore } from "@/stores/auth-store";
import { getAuthGate } from "@/utils/auth-gate";
import {
  canAccessAccountsManagement,
  canAccessWorkerManagement,
  canAccessSupplierManagement,
  canAccessCustomerManagement,
  canAccessRequestsManagement,
  canAccessOrdersManagement,
} from "@/constants/roles";
import type { RvbRole } from "@/types/rvb";

export default function ProfileStack() {
  const segments = useSegments();
  const { status, account } = useAuthStore();
  const gate = getAuthGate(status, account);
  const role = (gate === "app" ? account?.role : undefined) as RvbRole | undefined;
  const seg = segments as unknown as string[];
  // Segments include route groups: ["(app)", "(tabs)", "profile", <leaf?>].
  // Resolve the leaf after "profile" regardless of the "(tabs)" group.
  const profileIdx = seg.lastIndexOf("profile");
  const leaf = profileIdx >= 0 ? (seg[profileIdx + 1] as string | undefined) : undefined;
  const checker = leaf ? MANAGEMENT_ACCESS[leaf] : undefined;
  // PBS-BUG-037: redirect unauthorized management deep links to the safe
  // profile home. Note: expo-router instantiates a matched file route even
  // while this redirect is being processed, so the management list fetchers
  // in management.service.ts ALSO refuse unauthorized roles synchronously —
  // that service backstop (not this redirect) is what guarantees zero
  // forbidden backend requests. Auth-state routing stays owned by the root.
  if (checker && gate === "app" && (!role || !checker(role))) {
    return <Redirect href="/(app)/profile" />;
  }
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="payment" options={{ presentation: "card", headerShown: true, title: "Payment Request", headerBackTitle: "Back" }} />
      <Stack.Screen name="loan" options={{ presentation: "card", headerShown: true, title: "Loan Application", headerBackTitle: "Back" }} />
      <Stack.Screen name="discrepancy" options={{ presentation: "card", headerShown: true, title: "Discrepancy", headerBackTitle: "Back" }} />
      <Stack.Screen name="requests" options={{ presentation: "card", headerShown: true, title: "Requests", headerBackTitle: "Back" }} />
      <Stack.Screen name="activity" options={{ presentation: "card", headerShown: true, title: "Activity", headerBackTitle: "Back" }} />
      <Stack.Screen name="supply" options={{ presentation: "card", headerShown: true, title: "New Supply", headerBackTitle: "Back" }} />
      <Stack.Screen name="supplier-discrepancy" options={{ presentation: "card", headerShown: true, title: "Discrepancy", headerBackTitle: "Back" }} />
      <Stack.Screen name="supplier-requests" options={{ presentation: "card", headerShown: true, title: "Supplier Requests", headerBackTitle: "Back" }} />
      <Stack.Screen name="insert-shipment" options={{ presentation: "card", headerShown: true, title: "Insert Shipment", headerBackTitle: "Back" }} />
      <Stack.Screen name="customer-discrepancy" options={{ presentation: "card", headerShown: true, title: "Discrepancy", headerBackTitle: "Back" }} />
      <Stack.Screen name="place-order" options={{ presentation: "card", headerShown: true, title: "Place Order", headerBackTitle: "Back" }} />
      <Stack.Screen name="customer-orders" options={{ presentation: "card", headerShown: true, title: "Orders", headerBackTitle: "Back" }} />
      <Stack.Screen name="customer-requests" options={{ presentation: "card", headerShown: true, title: "Shipment Requests", headerBackTitle: "Back" }} />
      <Stack.Screen name="accounts" options={{ presentation: "card", headerShown: true, title: "Accounts & Access", headerBackTitle: "Back" }} />
      <Stack.Screen name="workers" options={{ presentation: "card", headerShown: true, title: "Workers", headerBackTitle: "Back" }} />
      <Stack.Screen name="suppliers" options={{ presentation: "card", headerShown: true, title: "Suppliers", headerBackTitle: "Back" }} />
      <Stack.Screen name="customers" options={{ presentation: "card", headerShown: true, title: "Customers", headerBackTitle: "Back" }} />
      <Stack.Screen name="requests-management" options={{ presentation: "card", headerShown: true, title: "Requests", headerBackTitle: "Back" }} />
      <Stack.Screen name="orders" options={{ presentation: "card", headerShown: true, title: "Orders Management", headerBackTitle: "Back" }} />
      <Stack.Screen name="notifications" options={{ presentation: "card", headerShown: true, title: "Notifications", headerBackTitle: "Back" }} />
    </Stack>
  );
}

// Route -> role-check mapping for the layout redirect above.
// (The management.service.ts fetch backstop is the zero-request guarantee.)
// NOTE (PBS-BUG-037 revision): `/profile/requests` is the WORKER self-service
// request-history screen (own endpoint) — legitimately reachable by worker
// (and supervisor own-worker experience, notification routing, dashboards) —
// so it is deliberately NOT in this deny map. The aggregated management
// review screen is `/profile/requests-management` (guarded below).
const MANAGEMENT_ACCESS: Record<string, (role: RvbRole) => boolean> = {
  accounts: canAccessAccountsManagement,
  workers: canAccessWorkerManagement,
  suppliers: canAccessSupplierManagement,
  customers: canAccessCustomerManagement,
  "requests-management": canAccessRequestsManagement,
  orders: canAccessOrdersManagement,
};
