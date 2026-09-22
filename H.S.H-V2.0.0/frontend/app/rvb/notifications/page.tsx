"use client";

import { useEffect, useState } from "react";
import RvbShell from "../../../src/components/rvb/RvbShell";
import RvbPlaceholder from "../../../src/components/rvb/RvbPlaceholder";
import { Bell } from "lucide-react";
import { settingsService } from "../../../src/services/settings.service";
import { DEFAULT_SETTINGS, SETTINGS_EVENT } from "../../../src/lib/settings";
import type { Settings } from "../../../src/types/settings/settings";

const TEXTS = {
  en: { title: "Notifications & Activity", desc: "RVB notifications, statuses and activity history." },
  fr: { title: "Notifications et activité", desc: "Notifications RVB, statuts et historique d'activité." },
  ar: { title: "الإشعارات والنشاط", desc: "إشعارات RVB والحالات وسجل النشاط." },
} as const;

export default function RvbNotificationsPage() {
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
    <RvbShell activePage="notifications">
      <RvbPlaceholder icon={Bell} title={t.title} description={t.desc} language={settings.language} />
    </RvbShell>
  );
}
