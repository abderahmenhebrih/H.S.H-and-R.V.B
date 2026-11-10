"use client";

import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { Language } from "../../types/settings/settings";

type Copy = { heading: string; body: string; home: string; back: string; retry: string };

const COPY: Record<"notFound" | "error", Record<Language, Copy>> = {
  notFound: {
    en: {
      heading: "Page not found",
      body: "The page you're looking for doesn't exist or was moved.",
      home: "Back to dashboard",
      back: "Go back",
      retry: "Try again",
    },
    fr: {
      heading: "Page introuvable",
      body: "La page demandée n'existe pas ou a été déplacée.",
      home: "Retour au tableau de bord",
      back: "Retour",
      retry: "Réessayer",
    },
    ar: {
      heading: "الصفحة غير موجودة",
      body: "الصفحة التي تبحث عنها غير موجودة أو تم نقلها.",
      home: "العودة إلى لوحة التحكم",
      back: "رجوع",
      retry: "حاول مجددًا",
    },
  },
  error: {
    en: {
      heading: "Something went wrong",
      body: "An unexpected error occurred. Your data is safe — please try again.",
      home: "Back to dashboard",
      back: "Go back",
      retry: "Try again",
    },
    fr: {
      heading: "Une erreur est survenue",
      body: "Une erreur inattendue s'est produite. Vos données sont intactes — veuillez réessayer.",
      home: "Retour au tableau de bord",
      back: "Retour",
      retry: "Réessayer",
    },
    ar: {
      heading: "حدث خطأ ما",
      body: "حدث خطأ غير متوقع. بياناتك آمنة — حاول مجددًا.",
      home: "العودة إلى لوحة التحكم",
      back: "رجوع",
      retry: "حاول مجددًا",
    },
  },
};

function readViewerLanguage(): Language {
  try {
    const htmlLang = typeof document !== "undefined" ? document.documentElement.lang : "";
    if (htmlLang === "ar" || htmlLang === "fr" || htmlLang === "en") return htmlLang;
    const stored = typeof window !== "undefined" ? window.localStorage.getItem("rvb-ui-language") : null;
    if (stored === "ar" || stored === "fr" || stored === "en") return stored;
  } catch {}
  return "en";
}

function subscribeDocumentLang(onChange: () => void): () => void {
  // No reactive language store exists; re-resolve only if <html lang> changes.
  if (typeof window === "undefined" || typeof MutationObserver === "undefined") return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  return () => observer.disconnect();
}

function snapshotDocumentLang(): Language {
  return readViewerLanguage();
}

export default function AppErrorPage({
  kind,
  onRetry,
}: {
  kind: "notFound" | "error";
  /** Recovery action (Next.js error-boundary `reset`). Omitted for 404. */
  onRetry?: () => void;
}) {
  const router = useRouter();
  // Mount-sync of an external (non-React) value is useSyncExternalStore's
  // exact use case: server snapshot "en", client re-reads and follows <html>.
  const lang = useSyncExternalStore(subscribeDocumentLang, snapshotDocumentLang, () => "en" as Language);
  const t = COPY[kind][lang] ?? COPY[kind].en;
  const rtl = lang === "ar";
  return (
    <main
      dir={rtl ? "rtl" : "ltr"}
      lang={lang}
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "var(--background, #f4f1ea)",
        color: "var(--text, #1d1a16)",
      }}
    >
      <section
        role="alert"
        aria-label={t.heading}
        style={{
          width: "min(520px, 100%)",
          background: "var(--panel, #fffdf8)",
          border: "1px solid var(--border, #e5ddcf)",
          borderRadius: 14,
          padding: 28,
          textAlign: "center",
          boxShadow: "0 2px 8px var(--shadow, rgba(0,0,0,0.06))",
        }}
      >
        <div aria-hidden="true" style={{ fontSize: 44, fontWeight: 800, letterSpacing: 2, color: "var(--accent, #8a6d1b)" }}>
          {kind === "notFound" ? "404" : "!"}
        </div>
        <h1 style={{ margin: "8px 0 6px", fontSize: 22 }}>{t.heading}</h1>
        <p style={{ margin: "0 0 20px", color: "var(--muted, #6b6259)", fontSize: 14 }}>{t.body}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              style={{
                padding: "10px 18px",
                borderRadius: 10,
                border: "1px solid var(--accent, #8a6d1b)",
                background: "var(--accent, #8a6d1b)",
                color: "#fff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {t.retry}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => router.push("/")}
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: "1px solid var(--border, #e5ddcf)",
              background: "var(--panel-hover, #faf7f0)",
              color: "inherit",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {t.home}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: "1px solid transparent",
              background: "transparent",
              color: "inherit",
              cursor: "pointer",
            }}
          >
            {t.back}
          </button>
        </div>
      </section>
    </main>
  );
}
