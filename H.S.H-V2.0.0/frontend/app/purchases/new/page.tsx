"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCachedSettings } from "../../../src/lib/settings";
import type { Language } from "../../../src/types/settings/settings";

const TR: Record<Language, string> = {
  en: "Redirecting to purchase entry…",
  fr: "Redirection vers la saisie d'achat…",
  ar: "جارٍ التحويل إلى إدخال المشتريات…",
};

// Canonical workflow is /purchases/entry — this route is obsolete.
// Preserve compatibility for old bookmarks via client redirect.
export default function PurchaseNewRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/purchases/entry");
  }, [router]);
  let lang: Language = "en";
  try {
    lang = getCachedSettings()?.language ?? "en";
  } catch {}
  return (
    <div style={{ padding: 24, color: "var(--muted)", fontSize: 13 }}>
      {TR[lang] ?? TR.en}
    </div>
  );
}
