"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { Language } from "../src/types/settings/settings";

const COPY: Record<Language, { heading: string; body: string; retry: string }> = {
  en: { heading: "Something went wrong", body: "The application hit a critical error. Please reload the page.", retry: "Reload page" },
  fr: { heading: "Une erreur est survenue", body: "L'application a rencontré une erreur critique. Veuillez recharger la page.", retry: "Recharger la page" },
  ar: { heading: "حدث خطأ ما", body: "واجه التطبيق خطأً حرجًا. يرجى إعادة تحميل الصفحة.", retry: "إعادة تحميل الصفحة" },
};

/**
 * Global error fallback: renders its own <html>/<body> because the root
 * layout itself may have failed. Minimal and dependency-free by design.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry?: () => void }) {
  const lang = useSyncExternalStore(
    (notify) => {
      if (typeof window === "undefined" || typeof MutationObserver === "undefined") return () => {};
      const observer = new MutationObserver(notify);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
      return () => observer.disconnect();
    },
    () => {
      try {
        const l = typeof document !== "undefined" ? document.documentElement.lang : "en";
        if (l === "ar" || l === "fr" || l === "en") return l;
      } catch {}
      return "en" as Language;
    },
    () => "en" as Language,
  );
  useEffect(() => {
    try {
      console.error("[global-error-boundary]", error?.digest || error?.message || error);
    } catch {}
  }, [error]);
  const t = COPY[lang] ?? COPY.en;
  const rtl = lang === "ar";
  return (
    <html lang={lang} dir={rtl ? "rtl" : "ltr"}>
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>
        <main
          dir={rtl ? "rtl" : "ltr"}
          style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f4f1ea", color: "#1d1a16" }}
        >
          <section role="alert" aria-label={t.heading} style={{ width: "min(520px, 100%)", background: "#fffdf8", border: "1px solid #e5ddcf", borderRadius: 14, padding: 28, textAlign: "center" }}>
            <div aria-hidden="true" style={{ fontSize: 44, fontWeight: 800, color: "#8a6d1b" }}>!</div>
            <h1 style={{ margin: "8px 0 6px", fontSize: 22 }}>{t.heading}</h1>
            <p style={{ margin: "0 0 20px", color: "#6b6259", fontSize: 14 }}>{t.body}</p>
            <button
              type="button"
              onClick={() => { try { if (retry) retry(); else window.location.reload(); } catch { try { window.location.reload(); } catch {} } }}
              style={{ padding: "10px 18px", borderRadius: 10, border: "1px solid #8a6d1b", background: "#8a6d1b", color: "#fff", fontWeight: 700, cursor: "pointer" }}
            >
              {t.retry}
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
