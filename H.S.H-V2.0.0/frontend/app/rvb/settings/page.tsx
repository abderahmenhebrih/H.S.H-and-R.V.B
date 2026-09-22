"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import RvbShell from "../../../src/components/rvb/RvbShell";
import { Settings as SettingsIcon } from "lucide-react";
import { settingsService } from "../../../src/services/settings.service";
import { DEFAULT_SETTINGS, SETTINGS_EVENT } from "../../../src/lib/settings";
import type { Settings } from "../../../src/types/settings/settings";
import styles from "../page.module.css";

const TEXTS = {
  en: {
    title: "Settings",
    desc: "Shared HSH / RVB application settings.",
    body: "RVB uses the same global settings as HSH — language, theme, currency and preferences are shared and applied instantly across both workspaces.",
    button: "Open Settings",
  },
  fr: {
    title: "Paramètres",
    desc: "Paramètres d'application partagés HSH / RVB.",
    body: "RVB utilise les mêmes paramètres globaux que HSH — langue, thème, devise et préférences sont partagés et appliqués instantanément dans les deux espaces.",
    button: "Ouvrir les paramètres",
  },
  ar: {
    title: "الإعدادات",
    desc: "إعدادات التطبيق المشتركة بين HSH و RVB.",
    body: "يستخدم RVB نفس الإعدادات العالمية مثل HSH — اللغة والمظهر والعملة والتفضيلات مشتركة ويتم تطبيقها فورا في المساحتين.",
    button: "فتح الإعدادات",
  },
} as const;

export default function RvbSettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  useEffect(() => {
    settingsService.get().then((s) => { if (s) setSettings(s); });
    const h = (e: Event) => {
      const ce = e as CustomEvent<Settings>;
      if (ce?.detail) setSettings(ce.detail);
      else settingsService.get().then((s) => { if (s) setSettings(s); });
    };
    window.addEventListener(SETTINGS_EVENT, h);
    window.addEventListener("storage", h);
    return () => { window.removeEventListener(SETTINGS_EVENT, h); window.removeEventListener("storage", h); };
  }, []);
  const t = TEXTS[settings.language];

  return (
    <RvbShell activePage="settings">
      <div className={styles.placeholderWrap}>
        <div className={styles.placeholderCard}>
          <div className={styles.placeholderIcon} aria-hidden="true">
            <SettingsIcon size={26} strokeWidth={2} />
          </div>
          <h2 className={styles.placeholderTitle}>{t.title}</h2>
          <p className={styles.placeholderDesc}>{t.desc}</p>
          <p className={styles.placeholderDesc} style={{ marginTop: 8 }}>{t.body}</p>
          <button
            type="button"
            onClick={() => router.push("/settings")}
            style={{
              marginTop: 14,
              minHeight: 38,
              padding: "0 16px",
              borderRadius: 9,
              border: "1px solid var(--border)",
              background: "var(--panel-hover)",
              color: "var(--text)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t.button}
          </button>
        </div>
      </div>
    </RvbShell>
  );
}
