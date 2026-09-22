"use client";

import { useEffect, useState } from "react";
import RvbShell from "../../../src/components/rvb/RvbShell";
import RvbPlaceholder from "../../../src/components/rvb/RvbPlaceholder";
import { ShoppingCart } from "lucide-react";
import { settingsService } from "../../../src/services/settings.service";
import { DEFAULT_SETTINGS, SETTINGS_EVENT } from "../../../src/lib/settings";
import type { Settings } from "../../../src/types/settings/settings";

const TEXTS = {
  en: { title: "Orders", desc: "Review and manage customer orders." },
  fr: { title: "Commandes", desc: "Consulter et gérer les commandes clients." },
  ar: { title: "الطلبات", desc: "مراجعة وإدارة طلبات الزبائن." },
} as const;

export default function RvbOrdersPage() {
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
    <RvbShell activePage="orders">
      <RvbPlaceholder icon={ShoppingCart} title={t.title} description={t.desc} language={settings.language} />
    </RvbShell>
  );
}
