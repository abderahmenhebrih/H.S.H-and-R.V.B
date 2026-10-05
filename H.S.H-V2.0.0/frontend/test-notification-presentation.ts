import type { Notification } from "./src/types/entities/notification";
import {
  formatRelativeTime,
  getImportantCount,
  getNotificationAction,
  getNotificationIcon,
  getNotificationImportance,
  getNotificationRoute,
  getNotificationTone,
  getUnreadCount,
  groupNotificationsByDay,
  isCriticalAlert,
  notifLabel,
  visibleNotifications,
} from "./src/lib/notification-presentation";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}
function eq(actual: unknown, expected: unknown, label: string) {
  assert(actual === expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

let seq = 0;
function notif(partial: Partial<Notification>): Notification {
  seq += 1;
  return {
    id: `n-${seq}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    syncStatus: "pending",
    type: "sale",
    severity: "success",
    title: "Sale recorded",
    message: "100 DA",
    ...partial,
  } as Notification;
}

async function main() {
  // Importance mapping — routine success stays normal…
  eq(getNotificationImportance(notif({ type: "sale", severity: "success" })), "normal", "sale normal");
  eq(getNotificationImportance(notif({ type: "purchase", severity: "success" })), "normal", "purchase normal");
  eq(getNotificationImportance(notif({ type: "payment", severity: "success" })), "normal", "payment normal");
  eq(getNotificationImportance(notif({ type: "worker", severity: "info" })), "normal", "worker info normal");
  // …actionable/failure becomes important…
  eq(getNotificationImportance(notif({ type: "customer_order", severity: "info" })), "important", "order important");
  eq(getNotificationImportance(notif({ type: "task", severity: "warning" })), "important", "task warning important");
  eq(getNotificationImportance(notif({ type: "sync", severity: "critical" })), "important", "sync critical important");
  eq(getNotificationImportance(notif({ type: "inventory", severity: "critical" })), "important", "inventory critical important");
  // …explicit stored priority wins.
  eq(getNotificationImportance(notif({ type: "sale", severity: "success", priority: "high" as any })), "important", "stored high");
  eq(getNotificationImportance(notif({ type: "sync", severity: "critical", priority: "normal" as any })), "important", "critical stays important");

  // CTA mapping — sparse, routine events get none.
  eq(getNotificationAction(notif({ type: "customer_order", severity: "info" })), "review", "order review CTA");
  eq(getNotificationAction(notif({ type: "task", severity: "warning" })), "open", "task open CTA");
  eq(getNotificationAction(notif({ type: "sale", severity: "success" })), null, "sale no CTA");
  eq(getNotificationAction(notif({ type: "payment", severity: "success" })), null, "payment no CTA");

  // Icons resolve per actual type, never undefined.
  for (const t of ["customer_order", "task", "payment", "purchase", "sale", "expense", "transfer", "worker", "vehicle", "inventory", "account", "sync", "system"] as const) {
    assert(!!getNotificationIcon(notif({ type: t })), `icon for ${t}`);
  }

  // Deep links use the stored route; blank → null.
  eq(getNotificationRoute(notif({ route: "/sales" })), "/sales", "route passthrough");
  eq(getNotificationRoute(notif({ route: "   " })), null, "blank route null");
  eq(getNotificationRoute(notif({})), null, "missing route null");

  // Counts: archived excluded everywhere; importance ≠ unread.
  const now = Date.now();
  const list = [
    notif({ readAt: undefined }),
    notif({ readAt: now - 1000 }),
    notif({ readAt: undefined, type: "customer_order", severity: "info" }),
    notif({ readAt: now - 2000, type: "sync", severity: "critical" }),
    notif({ readAt: undefined, archivedAt: now } as any),
  ];
  eq(visibleNotifications(list).length, 4, "archived excluded");
  eq(getUnreadCount(list), 2, "unread count");
  eq(getImportantCount(list), 2, "important count (read critical still counts)");

  // Grouping: Today / Yesterday / Earlier, newest-first, empties omitted.
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const t0 = startOfToday.getTime();
  const items = [
    notif({ createdAt: t0 - 10 * 86400000 }),
    notif({ createdAt: t0 + 3600000 }),
    notif({ createdAt: t0 - 86400000 + 3600000 }),
    notif({ createdAt: t0 + 7200000 }),
  ];
  const groups = groupNotificationsByDay([...items].sort((a, b) => b.createdAt - a.createdAt));
  eq(groups.map((g) => g.key).join(","), "today,yesterday,earlier", "group order");
  eq(groups[0].items.length, 2, "today count");
  assert(groups[0].items[0].createdAt >= groups[0].items[1].createdAt, "today newest-first");
  eq(groupNotificationsByDay([]).length, 0, "no groups when empty");
  eq(groupNotificationsByDay([notif({ createdAt: t0 + 1000 })]).map((g) => g.key).join(","), "today", "single group only");

  // Labels en/fr/ar.
  eq(notifLabel("all", "en"), "All", "label en");
  eq(notifLabel("unread", "fr"), "Non lus", "label fr");
  eq(notifLabel("important", "ar"), "المهمة", "label ar");
  eq(notifLabel("yesterday", "en"), "Yesterday", "label yesterday");
  eq(notifLabel("review", "fr"), "Examiner", "label review");

  // Red is reserved for true system failures (sync/system critical).
  // Business-actionable criticals (overdue tasks, out-of-stock) stay amber.
  assert(isCriticalAlert(notif({ type: "sync", severity: "critical" })), "sync critical is red");
  assert(isCriticalAlert(notif({ type: "system", severity: "critical" })), "system critical is red");
  assert(!isCriticalAlert(notif({ type: "task", severity: "critical" })), "task overdue not red");
  assert(!isCriticalAlert(notif({ type: "inventory", severity: "critical" })), "out-of-stock not red");
  assert(!isCriticalAlert(notif({ type: "customer_order", severity: "info" })), "order not red");
  eq(getNotificationTone(notif({ type: "sync", severity: "critical" })), "red", "sync tone red");
  eq(getNotificationTone(notif({ type: "task", severity: "critical" })), "amber", "overdue tone amber");
  eq(getNotificationTone(notif({ type: "customer_order", severity: "info" })), "amber", "order tone amber");
  eq(getNotificationTone(notif({ type: "sale", severity: "success" })), "green", "sale tone green");
  eq(getNotificationTone(notif({ type: "payment", severity: "success" })), "green", "payment tone green");
  eq(getNotificationTone(notif({ type: "worker", severity: "info" })), "neutral", "worker tone neutral");

  // Relative time sanity.
  eq(formatRelativeTime(Date.now() - 10000, "en"), "Just now", "relative now");
  assert(formatRelativeTime(Date.now() - 3600000, "en").includes("h"), "relative hour");

  console.log("Notification presentation test passed.");
}

main().catch((e) => {
  console.error("Notification presentation test failed.");
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
