"use client";

import { useEffect, useState } from "react";
import RvbShell from "../../../src/components/rvb/RvbShell";
import RvbPlaceholder from "../../../src/components/rvb/RvbPlaceholder";
import { Users } from "lucide-react";
import { settingsService } from "../../../src/services/settings.service";
import { DEFAULT_SETTINGS, SETTINGS_EVENT } from "../../../src/lib/settings";
import type { Settings } from "../../../src/types/settings/settings";

const TEXTS = {
  en: { title: "Workers", desc: "Worker profiles, salaries, credit, requests and activity." },
  fr: { title: "Travailleurs", desc: "Profils travailleurs, salaires, crédit, demandes et activité." },
  ar: { title: "العمال", desc: "ملفات العمال، الرواتب، الائتمان، الطلبات والنشاط." },
} as const;

export default function RvbWorkersPage() {
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
    <RvbShell activePage="workers">
      <RvbPlaceholder icon={Users} title={t.title} description={t.desc} language={settings.language} />
    </RvbShell>
  );
}
