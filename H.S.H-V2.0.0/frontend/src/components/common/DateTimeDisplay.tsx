"use client";

import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { formatDate } from "../../lib/datetime";
import styles from "../layout/CompactHeader.module.css";

type Props = {
  language?: string;
};

export default function DateTimeDisplay({ language = "en" }: Props) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const { dateStr, timeStr } = now
    ? formatDate(now, language)
    : { dateStr: "\u00A0", timeStr: "\u00A0" };

  return (
    <div className={styles.dateBlock}>
      <span className={styles.dateIcon} aria-hidden="true">
        <CalendarDays size={16} strokeWidth={2} aria-hidden="true" />
      </span>

      <div className={styles.dateText}>
        <span className={styles.dateLine}>{dateStr}</span>
        <span className={styles.timeLine}>{timeStr}</span>
      </div>
    </div>
  );
}
