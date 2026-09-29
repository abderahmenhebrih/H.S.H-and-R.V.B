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
};

export default function CompactHeader({
  title,
  description,
  dark,
  onToggleTheme,
  language = "en",
  settingsHref = "/settings",
  notificationBell,
  showUtilities = true,
}: Props) {
  const router = useRouter();

  return (
    <header className={styles.compactHeader}>
      <div className={styles.left}>
        <div className={styles.logo}>
          <img src="/chicken.jpg" alt="Hebrih logo" />
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
              aria-label="Toggle theme"
              title={dark ? "Switch to light mode" : "Switch to dark mode"}
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
              aria-label="Settings"
              title="Settings"
            >
              <Settings size={18} strokeWidth={2} aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    </header>
  );
}
