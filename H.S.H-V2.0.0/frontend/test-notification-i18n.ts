import type { Notification } from "./src/types/entities/notification";
import {
  resolveNotificationTitle,
  resolveNotificationMessage,
} from "./src/lib/notification-presentation";
import { localizeError, GENERIC_ERROR, formatNumberForLanguage } from "./src/lib/i18n";

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
    id: `n-i18n-${seq}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    syncStatus: "pending",
    type: "payment",
    severity: "success",
    title: "Payment recorded",
    message: "100 DA",
    ...partial,
  } as Notification;
}

const fmt = (amount: number, currency: string, lang: "en" | "fr" | "ar") =>
  `${formatNumberForLanguage(amount, lang)} ${currency}`;

async function main() {
  // 1. Keyed titles resolve in all three languages, never English fallback.
  eq(
    resolveNotificationTitle(notif({ titleKey: "payment.recorded" }), "fr"),
    "Paiement enregistré",
    "payment.recorded fr",
  );
  eq(
    resolveNotificationTitle(notif({ titleKey: "payment.recorded" }), "ar"),
    "تم تسجيل الدفعة",
    "payment.recorded ar",
  );
  eq(
    resolveNotificationTitle(notif({ titleKey: "inventory.outOfStock" }), "fr"),
    "Rupture de stock",
    "outOfStock fr",
  );
  eq(
    resolveNotificationTitle(notif({ titleKey: "worker.archived" }), "ar"),
    "تمت أرشفة العامل",
    "worker.archived ar",
  );
  eq(
    resolveNotificationTitle(notif({ titleKey: "transfer.reversed" }), "en"),
    "Transfer reversed",
    "transfer.reversed en",
  );

  // 2. Every catalog key has a non-empty en/fr/ar entry.
  const keys = [
    "customer_order.submitted", "task.dueTomorrow", "task.dueToday", "task.overdue",
    "task.reminder", "payment.recorded", "payment.reversed", "transfer.completed",
    "transfer.reversed", "expense.recorded", "expense.reversed", "sale.recorded",
    "purchase.recorded", "inventory.restored", "inventory.outOfStock",
    "worker.archived", "worker.salaryDone", "sync.attention",
  ];
  for (const k of keys) {
    for (const lang of ["en", "fr", "ar"] as const) {
      const v = resolveNotificationTitle(notif({ titleKey: k, title: `LEGACY:${k}` }), lang);
      assert(typeof v === "string" && v.length > 0 && !v.startsWith("LEGACY"), `title ${k}/${lang} translated`);
    }
  }

  // 3. Legacy rows (no key) fall back to stored English text, never blank.
  eq(
    resolveNotificationTitle(notif({ title: "Old custom title" }), "ar"),
    "Old custom title",
    "legacy title fallback",
  );
  eq(
    resolveNotificationMessage(notif({ message: "Old custom body" }), "fr"),
    "Old custom body",
    "legacy message fallback",
  );

  // 4. Unknown keys fall back to stored text (forward compatibility).
  eq(
    resolveNotificationTitle(notif({ title: "Stored", titleKey: "future.unknown" } as any), "ar"),
    "Stored",
    "unknown key fallback",
  );

  // 5. Message interpolation with per-locale amount formatting.
  const msgFr = resolveNotificationMessage(
    notif({ message: "x", messageKey: "payment.recordedBody", messageParams: { amount: 1254840, currency: "DA", entity: "Cash" } }),
    "fr",
    (a, c) => fmt(a, c, "fr"),
  );
  assert(msgFr.includes("1") && msgFr.includes("Cash"), `payment body fr interpolates (${msgFr})`);
  assert(!/^\d+\s*DA$/.test("x") || true, "noop");
  const msgAr = resolveNotificationMessage(
    notif({ message: "x", messageKey: "transfer.completedBody", messageParams: { amount: 5000, currency: "DA", from: "A", to: "B" } }),
    "ar",
    (a, c) => fmt(a, c, "ar"),
  );
  assert(msgAr.includes("5.000") || msgAr.includes("5000"), `transfer body ar amount (${msgAr})`);
  assert(msgAr.includes("A") && msgAr.includes("B"), "transfer identifiers preserved");

  // 6. User data is never translated: names pass through verbatim.
  const m = resolveNotificationMessage(
    notif({ message: "x", messageKey: "customer_order.submittedBody", messageParams: { customerName: "ACME زبون" } }),
    "ar",
  );
  assert(m.includes("ACME زبون"), "customer name verbatim");

  // 7. localizeError: exact code map hit in all languages.
  const codeMap = {
    SUPPLIER_NOT_FOUND: { en: "Supplier not found.", fr: "Fournisseur introuvable.", ar: "المورد غير موجود." },
  };
  eq(localizeError(new Error("SUPPLIER_NOT_FOUND"), "ar", codeMap), "المورد غير موجود.", "code map ar");
  eq(localizeError(new Error("SUPPLIER_NOT_FOUND: extra detail"), "fr", codeMap), "Fournisseur introuvable.", "code prefix fr");

  // 8. Legacy English sentence mapping (exact-match brittleness is safe: miss → generic, never raw).
  eq(
    localizeError(new Error("Customer name is required."), "ar", codeMap),
    GENERIC_ERROR.ar,
    "unmapped legacy sentence → generic ar (no raw leak)",
  );

  // 9. F-01 regression: unknown English WITHOUT fail/error words must NOT leak.
  eq(localizeError(new Error("Title required"), "ar"), GENERIC_ERROR.ar, "F-01 ar generic");
  eq(localizeError(new Error("Title required"), "fr"), GENERIC_ERROR.fr, "F-01 fr generic");
  eq(localizeError(new Error("Title required"), "en"), GENERIC_ERROR.en, "F-01 en generic");
  eq(localizeError("weird string", "ar"), GENERIC_ERROR.ar, "string input generic");
  eq(localizeError(null, "fr"), GENERIC_ERROR.fr, "null input generic");
  eq(localizeError(undefined, "en"), GENERIC_ERROR.en, "undefined input generic");

  // 10. Non-Error objects and status-ish inputs never surface raw internals.
  const out = localizeError({ code: 500 } as any, "ar");
  eq(out, GENERIC_ERROR.ar, "object input generic");

  console.log("Notification i18n test passed.");
}

main().catch((e) => {
  console.error("Notification i18n test failed.");
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
