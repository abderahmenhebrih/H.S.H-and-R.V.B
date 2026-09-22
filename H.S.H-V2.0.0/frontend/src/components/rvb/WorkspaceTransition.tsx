"use client";

import { useEffect, useState } from "react";
import styles from "./WorkspaceTransition.module.css";

type Props = {
  visible: boolean;
  target: "rvb" | "hsh";
  language: "en" | "fr" | "ar";
};

const TEXTS = {
  rvb: {
    en: { welcome: "Welcome to RVB", subtitle: "The Kingdom of White Meat" },
    fr: { welcome: "Bienvenue à RVB", subtitle: "Le Royaume des Viandes Blanches" },
    ar: { welcome: "مرحبا بكم في RVB", subtitle: "مملكة اللحوم البيضاء" },
  },
  hsh: {
    en: { welcome: "Welcome to HSH", subtitle: "Hebrih Slaughter House" },
    fr: { welcome: "Bienvenue à HSH", subtitle: "Abattoire Hebrih" },
    ar: { welcome: "مرحبا بكم في HSH", subtitle: "مذبح حبريح للدواجن" },
  },
} as const;

export default function WorkspaceTransition({ visible, target, language }: Props) {
  const [phase, setPhase] = useState<"hidden" | "entering" | "visible" | "exiting">("hidden");

  useEffect(() => {
    if (visible) {
      setPhase("entering");
      const t = setTimeout(() => setPhase("visible"), 20);
      return () => clearTimeout(t);
    } else {
      if (phase === "hidden") return;
      setPhase("exiting");
      const t = setTimeout(() => setPhase("hidden"), 320);
      return () => clearTimeout(t);
    }
  }, [visible]);

  if (phase === "hidden") return null;

  const t = TEXTS[target][language] ?? TEXTS[target].en;

  return (
    <div
      className={`${styles.overlay} ${phase === "entering" ? styles.entering : ""} ${phase === "visible" ? styles.visible : ""} ${phase === "exiting" ? styles.exiting : ""}`}
      aria-hidden={!visible}
      role="presentation"
    >
      <div className={styles.inner}>
        <div className={styles.logo} aria-hidden="true">
          <img src="/chicken.jpg" alt="" />
        </div>
        <h2 className={styles.title}>{t.welcome}</h2>
        <p className={styles.subtitle}>{t.subtitle}</p>
      </div>
    </div>
  );
}
