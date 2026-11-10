"use client";

import { useRouter } from "next/navigation";
import { Moon, Settings, Sun } from "lucide-react";
import styles from "./CompactHeader.module.css";
import DateTimeDisplay from "../common/DateTimeDisplay";

type Props = {
  title: string;
  description: string;
  dark: boolean;
  onToggleTheme: () => void;
  language?: "en" | "fr" | "ar";
  settingsHref?: string;
  notificationBell?: React.ReactNode;
  showUtilities?: boolean;
  themeLabel?: string;
  switchToLightLabel?: string;
  switchToDarkLabel?: string;
  settingsLabel?: string;
  logoAlt?: string;
};

const THEME_LABEL: Record<string, string> = { en: "Toggle theme", fr: "Basculer le thème", ar: "تبديل المظهر" };
const TO_LIGHT_LABEL: Record<string, string> = { en: "Switch to light mode", fr: "Passer en mode clair", ar: "التبديل إلى الوضع الفاتح" };
const TO_DARK_LABEL: Record<string, string> = { en: "Switch to dark mode", fr: "Passer en mode sombre", ar: "التبديل إلى الوضع الداكن" };
const SETTINGS_LABEL: Record<string, string> = { en: "Settings", fr: "Paramètres", ar: "الإعدادات" };
const LOGO_ALT: Record<string, string> = { en: "Hebrih logo", fr: "Logo Hebrih", ar: "شعار هبريه" };

export default function CompactHeader({
  title,
  description,
  dark,
  onToggleTheme,
  language = "en",
  settingsHref = "/settings",
  notificationBell,
  showUtilities = true,
  themeLabel,
  switchToLightLabel,
  switchToDarkLabel,
  settingsLabel,
  logoAlt,
}: Props) {
  const router = useRouter();
  const tTheme = themeLabel ?? THEME_LABEL[language] ?? THEME_LABEL.en;
  const tTitle = dark ? (switchToLightLabel ?? TO_LIGHT_LABEL[language] ?? TO_LIGHT_LABEL.en) : (switchToDarkLabel ?? TO_DARK_LABEL[language] ?? TO_DARK_LABEL.en);
  const tSettings = settingsLabel ?? SETTINGS_LABEL[language] ?? SETTINGS_LABEL.en;
  const tLogoAlt = logoAlt ?? LOGO_ALT[language] ?? LOGO_ALT.en;

  return (
    <header className={styles.compactHeader}>
      <div className={styles.left}>
        <div className={styles.logo}>
          <img src="/chicken.jpg" alt={tLogoAlt} />
        </div>

        <div className={styles.textBlock}>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.description}>{description}</p>
        </div>
      </div>

      <div className={styles.right}>
        <DateTimeDisplay language={language} />

        {showUtilities && (
          <>
            {notificationBell ?? null}

            <button
              type="button"
              className={styles.iconButton}
              onClick={onToggleTheme}
              aria-label={tTheme}
              title={tTitle}
            >
              {dark ? (
                <Sun size={18} strokeWidth={2} aria-hidden="true" />
              ) : (
                <Moon size={18} strokeWidth={2} aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              className={styles.iconButton}
              onClick={() => router.push(settingsHref)}
              aria-label={tSettings}
              title={tSettings}
            >
              <Settings size={18} strokeWidth={2} aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    </header>
  );
}
