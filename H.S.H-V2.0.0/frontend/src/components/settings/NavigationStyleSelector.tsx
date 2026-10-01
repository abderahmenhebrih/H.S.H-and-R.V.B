"use client";
import { Check, Orbit, PanelLeft } from "lucide-react";
import themeStyles from "./ThemeAppearanceSelector.module.css";
import styles from "./NavigationStyleSelector.module.css";
import type { Language, NavigationStyle } from "../../types/settings/settings";

type CardStrings = {
  title: string;
  desc: string;
  classic: string;
  classicDesc: string;
  floating: string;
  floatingDesc: string;
};

const TR_HSH: Record<Language, CardStrings> = {
  en: {
    title: "Navigation Style",
    desc: "Choose how you navigate through the application.",
    classic: "Classic Sidebar",
    classicDesc: "Expandable navigation sidebar",
    floating: "Floating Bubbles",
    floatingDesc: "Movable radial navigation",
  },
  fr: {
    title: "Style de navigation",
    desc: "Choisissez comment naviguer dans l'application.",
    classic: "Barre latérale",
    classicDesc: "Barre de navigation extensible",
    floating: "Bulles flottantes",
    floatingDesc: "Navigation radiale déplaçable",
  },
  ar: {
    title: "نمط التنقل",
    desc: "اختر طريقة التنقل في التطبيق.",
    classic: "الشريط الجانبي",
    classicDesc: "شريط تنقل قابل للتوسيع",
    floating: "فقاعات عائمة",
    floatingDesc: "تنقل دائري قابل للتحريك",
  },
};

type Props = {
  language: Language;
  value: NavigationStyle;
  onChange: (style: NavigationStyle) => void;
  variant?: "hsh" | "rvb";
};

const TR_RVB: Record<Language, CardStrings> = {
  en: {
    title: "RVB Navigation Style",
    desc: "Choose how you navigate through the RVB portal.",
    classic: "Classic Sidebar",
    classicDesc: "Expandable RVB navigation sidebar",
    floating: "Floating Bubbles",
    floatingDesc: "Movable radial RVB navigation",
  },
  fr: {
    title: "Style de navigation RVB",
    desc: "Choisissez comment naviguer dans le portail RVB.",
    classic: "Barre latérale",
    classicDesc: "Barre de navigation RVB extensible",
    floating: "Bulles flottantes",
    floatingDesc: "Navigation radiale RVB déplaçable",
  },
  ar: {
    title: "نمط التنقل RVB",
    desc: "اختر طريقة التنقل في بوابة RVB.",
    classic: "الشريط الجانبي",
    classicDesc: "شريط تنقل RVB قابل للتوسيع",
    floating: "فقاعات عائمة",
    floatingDesc: "تنقل دائري RVB قابل للتحريك",
  },
};

export default function NavigationStyleSelector({ language, value, onChange, variant = "hsh" }: Props) {
  const table = variant === "rvb" ? TR_RVB : TR_HSH;
  const t = table[language] ?? table.en;

  return (
    <div className={themeStyles.section}>
      <h2 className={themeStyles.sectionTitle}>{t.title}</h2>
      <p className={themeStyles.sectionDesc}>{t.desc}</p>
      <div className={themeStyles.themeGrid}>
        <button
          type="button"
          className={`${themeStyles.themeCard} ${value === "classic" ? themeStyles.themeActive : ""}`}
          onClick={() => onChange("classic")}
          aria-pressed={value === "classic"}
        >
          <div className={styles.previewFrame} aria-hidden="true">
            <div className={styles.miniSidebar}>
              <span className={styles.miniLogo} />
              <span className={styles.miniRow} />
              <span className={styles.miniRow} />
              <span className={`${styles.miniRow} ${styles.miniRowActive}`} />
              <span className={`${styles.miniRow} ${styles.miniRowChild}`} />
              <span className={`${styles.miniRow} ${styles.miniRowChild}`} />
              <span className={styles.miniRow} />
              <span className={styles.miniFooter}>
                <i />
                <i />
                <i />
              </span>
            </div>
            <div className={styles.miniMain}>
              <span className={styles.miniLine} />
              <span className={styles.miniBlock} />
            </div>
          </div>
          <strong>
            <PanelLeft size={14} /> {t.classic}
          </strong>
          <small>{t.classicDesc}</small>
          {value === "classic" && (
            <span className={themeStyles.checkBadge}>
              <Check size={12} />
            </span>
          )}
        </button>
        <button
          type="button"
          className={`${themeStyles.themeCard} ${value === "floating" ? themeStyles.themeActive : ""}`}
          onClick={() => onChange("floating")}
          aria-pressed={value === "floating"}
        >
          <div className={styles.previewFrame} aria-hidden="true">
            <div className={styles.orbitField}>
              <span className={`${styles.orbitPill} ${styles.orbitTop}`} />
              <span className={`${styles.orbitPill} ${styles.orbitRight}`} />
              <span className={styles.orbitLauncher} />
              <span className={`${styles.orbitPill} ${styles.orbitLeft}`} />
              <span className={`${styles.orbitPill} ${styles.orbitBottom}`} />
              <span className={`${styles.orbitDot} ${styles.orbitDotA}`} />
              <span className={`${styles.orbitDot} ${styles.orbitDotB}`} />
              <span className={`${styles.orbitDot} ${styles.orbitDotC}`} />
            </div>
          </div>
          <strong>
            <Orbit size={14} /> {t.floating}
          </strong>
          <small>{t.floatingDesc}</small>
          {value === "floating" && (
            <span className={themeStyles.checkBadge}>
              <Check size={12} />
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
