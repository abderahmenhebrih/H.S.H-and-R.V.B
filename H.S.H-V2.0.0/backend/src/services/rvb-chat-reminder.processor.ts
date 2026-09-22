import { RvbChatReminderModel } from "../models/rvb-chat-reminder.model";
import { RvbAccountModel } from "../models/rvb-account.model";
import { MessageModel } from "../models/message.model";
import { ConversationModel } from "../models/conversation.model";
import { createRvbNotification } from "./rvb-notification.service";

let intervalHandle: NodeJS.Timeout | null = null;

function isDisabled(): boolean {
  if (process.env.RVB_REMINDER_DISABLED === "true") return true;
  if (process.env.NODE_ENV === "test" || process.env.RVB_TEST_MODE === "true") return true;
  // also allow explicit disable via env
  if (process.env.DISABLE_RVB_REMINDER === "1") return true;
  return false;
}

export async function processDueRemindersOnce(limit = 20): Promise<number> {
  const now = Date.now();
  const due = await RvbChatReminderModel.find({ dueAt: { $lte: now }, sentAt: null })
    .sort({ dueAt: 1 })
    .limit(limit)
    .lean();
  let sent = 0;
  for (const rem of due as any[]) {
    // Atomic claim: only one processor will set sentAt
    const claimed: any = await RvbChatReminderModel.findOneAndUpdate(
      { id: rem.id, sentAt: null },
      { $set: { sentAt: now } },
      { returnDocument: "after" } as any
    );
    if (!claimed || claimed.sentAt !== now) {
      // someone else claimed or already sent
      continue;
    }
    // Verify recipient still eligible
    const recipientId = rem.recipientAccountId as string;
    const acc: any = await RvbAccountModel.findOne({ id: recipientId }).lean();
    if (!acc || acc.status !== "active") {
      // do not deliver, but already claimed as sent to avoid retry loop
      continue;
    }
    // Fetch message / conversation for context (best effort)
    let msg: any = null;
    let conv: any = null;
    try {
      msg = await MessageModel.findOne({ id: rem.messageId }).lean();
    } catch {}
    try {
      conv = await ConversationModel.findOne({ id: rem.conversationId }).lean();
    } catch {}
    const convName = conv?.name || (conv?.officialKind === "workers_group" ? "Workers" : conv?.officialKind === "suppliers_group" ? "Suppliers" : conv?.officialKind === "customers_group" ? "Customers" : conv?.name || "Chat");
    const preview = msg?.content ? String(msg.content).slice(0, 80) : "";
    try {
      await createRvbNotification({
        type: "system",
        severity: "warning",
        title: `Reminder: you were mentioned in ${convName}`,
        message: preview ? `Reminder: ${preview}` : `Reminder: you were mentioned`,
        entityType: "conversation",
        entityId: rem.conversationId,
        route: "/rvb/chats",
        sourceEventId: `chat:reminder:${rem.id}`,
        audienceType: "user",
        audienceIds: [recipientId],
        priority: "high",
        category: "reminders",
        mandatory: false,
        isReminder: true,
      } as any);
      sent++;
    } catch (e) {
      // If notification creation fails due to race, we have already claimed sentAt, so we don't retry infinitely
      // Log but continue
      // eslint-disable-next-line no-console
      console.warn("[reminder] create notification failed for", rem.id, (e as any)?.message);
    }
  }
  return sent;
}

export function startRvbChatReminderProcessor(intervalMs = 45000): void {
  if (isDisabled()) {
    // eslint-disable-next-line no-console
    console.log("[reminder] processor disabled (test mode)");
    return;
  }
  if (intervalHandle) return;
  // Immediate tick after 5s to avoid startup thundering herd
  const tick = async () => {
    try {
      await processDueRemindersOnce(30);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[reminder] tick error", (e as any)?.message);
    }
  };
  setTimeout(tick, 5000);
  intervalHandle = setInterval(tick, intervalMs);
  // eslint-disable-next-line no-console
  console.log("[reminder] processor started, interval", intervalMs);
}

export function stopRvbChatReminderProcessor(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
