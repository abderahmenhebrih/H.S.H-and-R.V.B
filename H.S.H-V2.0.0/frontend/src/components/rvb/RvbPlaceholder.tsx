"use client";

import type { LucideIcon } from "lucide-react";
import styles from "../../../app/rvb/page.module.css";

type Props = {
  icon: LucideIcon;
  title: string;
  description: string;
  language: "en" | "fr" | "ar";
};

const comingSoonText = {
  en: "Coming soon",
  fr: "Bientôt disponible",
  ar: "قريباً",
} as const;

export default function RvbPlaceholder({ icon: Icon, title, description, language }: Props) {
  return (
    <div className={styles.placeholderWrap}>
      <div className={styles.placeholderCard}>
        <div className={styles.placeholderIcon} aria-hidden="true">
          <Icon size={26} strokeWidth={2} />
        </div>
        <h2 className={styles.placeholderTitle}>{title}</h2>
        <p className={styles.placeholderDesc}>{description}</p>
        <span className={styles.comingSoon}>{comingSoonText[language]}</span>
      </div>
    </div>
  );
}
