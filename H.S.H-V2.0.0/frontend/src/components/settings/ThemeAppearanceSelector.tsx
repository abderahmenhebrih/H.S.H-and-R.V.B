"use client";
import { Check, Sun, Moon } from "lucide-react";
import { getSavedTheme, applyTheme } from "../../lib/theme";
import styles from "./ThemeAppearanceSelector.module.css";
import type { Language } from "../../types/settings/settings";

const TR: Record<Language, any> = {
  en: {
    title: "Appearance",
    desc: "Choose how the application looks.",
    light: "Light",
    dark: "Dark",
    lightDesc: "Bright cream interface",
    darkDesc: "Dark comfort mode",
  },
  fr: {
    title: "Apparence",
    desc: "Choisissez l'apparence de l'application.",
    light: "Clair",
    dark: "Sombre",
    lightDesc: "Interface claire crème",
    darkDesc: "Mode sombre",
  },
  ar: {
    title: "المظهر",
    desc: "اختر مظهر التطبيق.",
    light: "فاتح",
    dark: "داكن",
    lightDesc: "واجهة فاتحة",
    darkDesc: "وضع داكن",
  },
};

type Props = {
  language: Language;
  dark: boolean;
  onThemeChange?: (theme: "light" | "dark") => void;
};

export default function ThemeAppearanceSelector({ language, dark, onThemeChange }: Props) {
  const t = TR[language] ?? TR.en;

  const handleToggle = (val: "light" | "dark") => {
    applyTheme(val);
    onThemeChange?.(val);
    // Also dispatch for settings listeners (shared setting via localStorage + event)
    // applyTheme already dispatches hebrih-theme-change
  };

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>{t.title}</h2>
      <p className={styles.sectionDesc}>{t.desc}</p>
      <div className={styles.themeGrid}>
        <button
          type="button"
          className={`${styles.themeCard} ${!dark ? styles.themeActive : ""}`}
          onClick={() => handleToggle("light")}
          aria-pressed={!dark}
        >
          <div className={`${styles.previewFrame} ${styles.previewLight}`} aria-hidden="true">
            <div className={styles.previewHeader} />
            <div className={styles.previewBody}>
              <div className={styles.previewSidebar}>
                <span className={styles.previewNavItem} />
                <span className={`${styles.previewNavItem} ${styles.previewNavActive}`} />
                <span className={styles.previewNavItem} />
              </div>
              <div className={styles.previewMain}>
                <span className={styles.previewLine} />
                <span className={styles.previewBlock} />
              </div>
            </div>
          </div>
          <strong>
            <Sun size={14} /> {t.light}
          </strong>
          <small>{t.lightDesc}</small>
          {!dark && (
            <span className={styles.checkBadge}>
              <Check size={12} />
            </span>
          )}
        </button>
        <button
          type="button"
          className={`${styles.themeCard} ${dark ? styles.themeActive : ""}`}
          onClick={() => handleToggle("dark")}
          aria-pressed={dark}
        >
          <div className={`${styles.previewFrame} ${styles.previewDark}`} aria-hidden="true">
            <div className={styles.previewHeader} />
            <div className={styles.previewBody}>
              <div className={styles.previewSidebar}>
                <span className={styles.previewNavItem} />
                <span className={`${styles.previewNavItem} ${styles.previewNavActive}`} />
                <span className={styles.previewNavItem} />
              </div>
              <div className={styles.previewMain}>
                <span className={styles.previewLine} />
                <span className={styles.previewBlock} />
              </div>
            </div>
          </div>
          <strong>
            <Moon size={14} /> {t.dark}
          </strong>
          <small>{t.darkDesc}</small>
          {dark && (
            <span className={styles.checkBadge}>
              <Check size={12} />
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
