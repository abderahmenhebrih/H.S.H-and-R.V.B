import { notificationService } from "./notification.service";
import { isApplyingRemote } from "../lib/database/sync-hooks";
import { settingsService } from "./settings.service";
import { formatCurrency } from "../lib/settings";
import type { NotificationType, NotificationSeverity } from "../types/entities/notification";

function shouldNotifyForRemote(): boolean {
  if (isApplyingRemote()) return false;
  return true;
}

async function getNotificationSettings(): Promise<any> {
  try {
    const s: any = await settingsService.get();
    return s?.notifications ?? {};
  } catch {
    return {};
  }
}

async function shouldCreateInApp(type: string): Promise<boolean> {
  const prefs = await getNotificationSettings();
  if (prefs.inAppEnabled === false) return false;
  if (type === "customer_order" && prefs.customerOrders === false) return false;
  if (type === "task" && prefs.tasks === false) return false;
  if (type === "inventory" && prefs.inventory === false) return false;
  if (["payment", "purchase", "sale", "expense", "transfer", "account"].includes(type) && prefs.financial === false) return false;
  if ((type === "sync" || type === "system") && prefs.system === false) return false;
  return true;
}

async function maybeShowDesktopToast(notification: { title: string; message: string; type: string }): Promise<void> {
  try {
    const prefs: any = await getNotificationSettings();
    if (!prefs.desktopEnabled) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    // Only for important categories by default
    const important = ["customer_order", "task", "inventory", "sync", "system"];
    if (!important.includes(notification.type)) return;
    // Use a simple notification
    new Notification(notification.title, { body: notification.message });
    // Sound if enabled
    if (prefs.soundEnabled) {
      try {
        const audio = new Audio("/notification.mp3");
        audio.volume = 0.5;
        void audio.play().catch(() => {});
      } catch {}
    }
  } catch {}
}

export async function notifyCustomerOrder(input: { orderId: string; customerName: string; route?: string }): Promise<void> {
  if (!shouldNotifyForRemote()) return;
  if (!(await shouldCreateInApp("customer_order"))) return;
  const sourceEventId = `customer-order:${input.orderId}:submitted`;
  const existing = await notificationService.findBySourceEventId(sourceEventId);
  if (existing) return;
  const n = await notificationService.create({
    type: "customer_order",
    severity: "info",
    title: "New customer order",
    message: `${input.customerName} submitted a new order.`,
    entityType: "customer",
    entityId: input.orderId,
    route: input.route ?? "/sales",
    sourceEventId,
    audienceType: "all",
  });
  if (n) await maybeShowDesktopToast(n);
}

export async function notifyTaskDue(input: { taskId: string; taskName: string; dueDate: number; kind: "due-tomorrow" | "due-today" | "overdue"; route?: string }): Promise<void> {
  if (!shouldNotifyForRemote()) return;
  if (!(await shouldCreateInApp("task"))) return;
  const dateStr = new Date(input.dueDate).toISOString().slice(0, 10);
  const sourceEventId = `task:${input.taskId}:${input.kind}:${dateStr}`;
  const existing = await notificationService.findBySourceEventId(sourceEventId);
  if (existing) return;
  const titles: Record<string, string> = {
    "due-tomorrow": "Task due tomorrow",
    "due-today": "Task due today",
    overdue: "Task overdue",
  };
  const severities: Record<string, NotificationSeverity> = {
    "due-tomorrow": "info",
    "due-today": "warning",
    overdue: "critical",
  };
  const n = await notificationService.create({
    type: "task",
    severity: severities[input.kind] ?? "info",
    title: titles[input.kind] ?? "Task reminder",
    message: input.taskName,
    entityType: "task",
    entityId: input.taskId,
    route: input.route ?? "/tasks",
    sourceEventId,
  });
  if (n) await maybeShowDesktopToast(n);
}

export async function notifyPayment(input: { paymentId: string; amount: number; currency: string; entityName?: string; entityType: string; isReversal?: boolean }): Promise<void> {
  if (!shouldNotifyForRemote()) return;
  const kind = input.isReversal ? "reversed" : "recorded";
  const sourceEventId = `payment:${input.paymentId}:${kind}`;
  const existing = await notificationService.findBySourceEventId(sourceEventId);
  if (existing) return;
  const settings: any = await settingsService.get().catch(() => null);
  if (settings?.notifications && settings.notifications.financial === false) return;

  const formatted = formatCurrency(input.amount, (input.currency as any) ?? "DA");
  const verb = input.isReversal ? "reversed" : "recorded";
  const title = `Payment ${verb}`;
  const message = input.entityName ? `${formatted} ${verb === "recorded" ? "· " + input.entityName : ""}` : `${formatted} ${verb}`;

  await notificationService.create({
    type: "payment",
    severity: "success",
    title,
    message,
    entityType: "payment",
    entityId: input.paymentId,
    route: "/payments",
    sourceEventId,
  });
}

export async function notifyTransfer(input: { transferId: string; amount: number; currency: string; fromAccount: string; toAccount: string; isReversal?: boolean }): Promise<void> {
  if (!shouldNotifyForRemote()) return;
  const kind = input.isReversal ? "reversed" : "completed";
  const sourceEventId = `transfer:${input.transferId}:${kind}`;
  if (await notificationService.findBySourceEventId(sourceEventId)) return;
  const settings: any = await settingsService.get().catch(() => null);
  if (settings?.notifications && settings.notifications.financial === false) return;
  const formatted = formatCurrency(input.amount, (input.currency as any) ?? "DA");
  await notificationService.create({
    type: "transfer",
    severity: "success",
    title: `Transfer ${kind}`,
    message: `${formatted} ${input.fromAccount} → ${input.toAccount}`,
    entityType: "transfer",
    entityId: input.transferId,
    route: "/accounts",
    sourceEventId,
  });
}

export async function notifyExpense(input: { expenseId: string; amount: number; currency: string; name: string; isReversal?: boolean }): Promise<void> {
  if (!shouldNotifyForRemote()) return;
  const kind = input.isReversal ? "reversed" : "recorded";
  const sourceEventId = `expense:${input.expenseId}:${kind}`;
  if (await notificationService.findBySourceEventId(sourceEventId)) return;
  const settings: any = await settingsService.get().catch(() => null);
  if (settings?.notifications && settings.notifications.financial === false) return;
  const formatted = formatCurrency(input.amount, (input.currency as any) ?? "DA");
  await notificationService.create({
    type: "expense",
    severity: "success",
    title: `Expense ${kind}`,
    message: `${input.name} · ${formatted}`,
    entityType: "expense",
    entityId: input.expenseId,
    route: "/expenses",
    sourceEventId,
  });
}

export async function notifySalePurchase(input: { id: string; type: "sale" | "purchase"; total: number; currency: string }): Promise<void> {
  if (!shouldNotifyForRemote()) return;
  const sourceEventId = `${input.type}:${input.id}:recorded`;
  if (await notificationService.findBySourceEventId(sourceEventId)) return;
  const settings: any = await settingsService.get().catch(() => null);
  if (settings?.notifications && settings.notifications.financial === false) return;
  const formatted = formatCurrency(input.total, (input.currency as any) ?? "DA");
  await notificationService.create({
    type: input.type,
    severity: "success",
    title: `${input.type === "sale" ? "Sale" : "Purchase"} recorded`,
    message: formatted,
    entityType: input.type,
    entityId: input.id,
    route: input.type === "sale" ? "/sales" : "/purchases",
    sourceEventId,
  });
}

export async function notifyInventory(input: { productId: string; productName: string; quantity: number }): Promise<void> {
  if (!shouldNotifyForRemote()) return;
  const settings: any = await settingsService.get().catch(() => null);
  if (settings?.notifications && settings.notifications.inventory === false) return;
  let severity: NotificationSeverity = "info";
  let title = "Stock restored";
  let key = "restored";
  if (input.quantity <= 0) {
    severity = "critical";
    title = "Out of stock";
    key = "out-of-stock";
  } else if (input.quantity < 10) {
    // Only if we have threshold, for now out-of-stock only as per spec fallback
    return;
  } else {
    return;
  }
  const sourceEventId = `inventory:${input.productId}:${key}`;
  if (await notificationService.findBySourceEventId(sourceEventId)) return;
  await notificationService.create({
    type: "inventory",
    severity,
    title,
    message: input.productName,
    entityType: "product",
    entityId: input.productId,
    route: "/products",
    sourceEventId,
  });
}

export async function notifyWorker(input: { workerId: string; workerName: string; action: "archived" | "salary" }): Promise<void> {
  if (!shouldNotifyForRemote()) return;
  const sourceEventId = `worker:${input.workerId}:${input.action}:${Date.now()}`;
  // For archived/salary, we don't deduplicate strictly, but we can
  await notificationService.create({
    type: "worker",
    severity: "info",
    title: input.action === "archived" ? "Worker archived" : "Salary operation completed",
    message: input.workerName,
    entityType: "worker",
    entityId: input.workerId,
    route: "/workers",
    sourceEventId,
  });
}

export async function notifySyncTerminal(input: { operationId: string; entity: string; message: string }): Promise<void> {
  // This is called when a sync operation becomes terminal
  const sourceEventId = `sync-terminal:${input.operationId}`;
  if (await notificationService.findBySourceEventId(sourceEventId)) return;
  await notificationService.create({
    type: "sync",
    severity: "critical",
    title: "Synchronization requires attention",
    message: input.message,
    entityType: input.entity,
    sourceEventId,
    route: "/settings",
  });
}

// Task evaluator
export async function evaluateTaskNotifications(tasks: Array<{ id: string; name: string; deadline: number; status?: string; completedAt?: number }>): Promise<void> {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const today = now.getTime();
  const tomorrow = today + 24 * 60 * 60 * 1000;

  for (const task of tasks) {
    if (task.status === "completed" || task.completedAt) continue;
    const deadline = new Date(task.deadline);
    deadline.setHours(0, 0, 0, 0);
    const d = deadline.getTime();
    if (d === tomorrow) {
      await notifyTaskDue({ taskId: task.id, taskName: task.name, dueDate: task.deadline, kind: "due-tomorrow" });
    } else if (d === today) {
      await notifyTaskDue({ taskId: task.id, taskName: task.name, dueDate: task.deadline, kind: "due-today" });
    } else if (d < today) {
      await notifyTaskDue({ taskId: task.id, taskName: task.name, dueDate: task.deadline, kind: "overdue" });
    }
  }
}
