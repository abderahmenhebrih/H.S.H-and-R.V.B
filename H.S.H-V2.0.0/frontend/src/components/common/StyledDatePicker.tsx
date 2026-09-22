"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import type { Language } from "../../types/settings/settings";
import styles from "./StyledDatePicker.module.css";

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseISODate(iso: string): Date | null {
  if (!iso) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function formatInputValue(date: Date | null): string {
  if (!date) return "";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

type Props = {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  language?: Language;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
};

type CalendarView = "days" | "months" | "years";

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function StyledDatePicker({ value, onChange, language = "en", placeholder, ariaLabel, className }: Props) {
  const parsed = useMemo(() => parseISODate(value), [value]);
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState<Date>(() => parsed ?? new Date());
  const [viewMode, setViewMode] = useState<CalendarView>("days");
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const yearGridRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const checkTheme = () => {
      const dark = localStorage.getItem("hebrih-theme") === "dark" || document.documentElement.classList.contains("themeDark") || document.body.classList.contains("themeDark");
      setIsDark(dark);
    };
    checkTheme();
    window.addEventListener("hebrih-theme-change", checkTheme);
    window.addEventListener("storage", checkTheme);
    const obs = new MutationObserver(checkTheme);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    obs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => {
      window.removeEventListener("hebrih-theme-change", checkTheme);
      window.removeEventListener("storage", checkTheme);
      obs.disconnect();
    };
  }, []);
  useEffect(() => {
    if (parsed) setViewDate(new Date(parsed));
  }, [parsed]);

  useEffect(() => {
    if (open) setViewMode("days");
  }, [open]);

  const computePosition = () => {
    if (!triggerRef.current || !menuRef.current) return;
    const dateRect = triggerRef.current.getBoundingClientRect();
    const menuRect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const gap = 16;
    const popoverWidth = 300;
    const popoverHeight = menuRect.height || 340;

    const modalEl = triggerRef.current.closest('[role="dialog"]') as HTMLElement | null;
    if (!modalEl) {
      let top = dateRect.bottom + 8;
      let left = dateRect.left;
      if (top + popoverHeight > viewportHeight - 8) {
        top = dateRect.top - popoverHeight - 8;
      }
      if (left + popoverWidth > viewportWidth - 8) left = viewportWidth - popoverWidth - 8;
      if (left < 8) left = 8;
      if (top < 8) top = 8;
      setMenuStyle({ top: `${top}px`, left: `${left}px`, width: `${popoverWidth}px` });
      return;
    }

    const modalRect = modalEl.getBoundingClientRect();

    const isSmallViewport = viewportWidth < 720;
    const totalNeeded = modalRect.width + popoverWidth + gap * 2 + 32;
    if (isSmallViewport || viewportWidth < totalNeeded) {
      const spaceRight = viewportWidth - modalRect.right - gap;
      const spaceLeft = modalRect.left - gap;
      const fitsRight = spaceRight >= popoverWidth;
      const fitsLeft = spaceLeft >= popoverWidth;
      if (!fitsRight && !fitsLeft) {
        const centeredWidth = Math.min(300, viewportWidth - 16);
        const left = (viewportWidth - centeredWidth) / 2;
        const top = Math.max(8, (viewportHeight - popoverHeight) / 2);
        setMenuStyle({ top: `${top}px`, left: `${left}px`, width: `${centeredWidth}px` });
        return;
      }
    }

    let left = modalRect.left - popoverWidth - gap;
    let top = modalRect.top + 100;

    if (left < 8) left = 8;
    if (left + popoverWidth > viewportWidth - 8) {
      left = Math.max(8, viewportWidth - popoverWidth - 8);
    }

    if (top + popoverHeight > viewportHeight - 8) {
      top = viewportHeight - popoverHeight - 8;
    }
    if (top < 8) top = 8;

    setMenuStyle({
      top: `${top}px`,
      left: `${left}px`,
      width: `${popoverWidth}px`,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    const raf1 = requestAnimationFrame(() => {
      computePosition();
      requestAnimationFrame(() => computePosition());
    });
    return () => cancelAnimationFrame(raf1);
  }, [open, viewDate, viewMode]);

  useEffect(() => {
    if (!open) return;
    const handleResize = () => computePosition();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleScroll = () => setOpen(false);
    window.addEventListener("scroll", handleScroll, true);
    document.addEventListener("scroll", handleScroll, true);
    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("scroll", handleScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  const display = useMemo(() => {
    if (!parsed) return placeholder ?? "";
    return formatInputValue(parsed);
  }, [parsed, placeholder]);

  const monthLabel = useMemo(() => {
    const locale = language === "ar" ? "ar-DZ-u-nu-latn" : language === "fr" ? "fr-FR" : "en-GB";
    try {
      return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", numberingSystem: "latn" } as any).format(viewDate);
    } catch {
      return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", numberingSystem: "latn" } as any).format(viewDate);
    }
  }, [viewDate, language]);

  const weekdayNames = useMemo(() => {
    const names: string[] = [];
    const base = new Date(2026, 0, 5);
    const locale = language === "ar" ? "ar-DZ-u-nu-latn" : language === "fr" ? "fr-FR" : "en-GB";
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      try {
        names.push(new Intl.DateTimeFormat(locale, { weekday: "short", numberingSystem: "latn" } as any).format(d));
      } catch {
        names.push(new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(d));
      }
    }
    return names;
  }, [language]);

  const calendarDays = useMemo(() => {
    const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const weekday = first.getDay();
    const offsetDays = (weekday + 6) % 7;
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1 + i - offsetDays);
      days.push(d);
    }
    return days;
  }, [viewDate]);

  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const isSameDay = (a: Date | null, b: Date | null) => {
    if (!a || !b) return false;
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  };

  const handlePrev = () => setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  const handleNext = () => setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  const handleYearPrev = () => setViewDate((prev) => new Date(prev.getFullYear() - 1, prev.getMonth(), 1));
  const handleYearNext = () => setViewDate((prev) => new Date(prev.getFullYear() + 1, prev.getMonth(), 1));

  const handleMonthSelect = (monthIndex: number) => {
    setViewDate(new Date(viewDate.getFullYear(), monthIndex, 1));
    setViewMode("days");
  };

  const handleYearSelect = (year: number) => {
    setViewDate(new Date(year, viewDate.getMonth(), 1));
    setViewMode("months");
  };

  const handleToday = () => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    onChange(toISODate(now));
    setViewDate(now);
    setOpen(false);
  };
  const handleClear = () => {
    onChange("");
    setOpen(false);
  };

  const tToday = language === "fr" ? "Aujourd'hui" : language === "ar" ? "اليوم" : "Today";
  const tClear = language === "fr" ? "Effacer" : language === "ar" ? "مسح" : "Clear";

  const monthGrid = useMemo(() => {
    return MONTH_ABBR.map((abbr, idx) => {
      const isCurrentMonth = today.getMonth() === idx && today.getFullYear() === viewDate.getFullYear();
      const isSelectedMonth = parsed ? parsed.getMonth() === idx && parsed.getFullYear() === viewDate.getFullYear() : false;
      const isViewingMonth = viewDate.getMonth() === idx;
      return { abbr, idx, isCurrentMonth, isSelectedMonth, isViewingMonth };
    });
  }, [viewDate, today, parsed]);

  const yearRange = useMemo(() => {
    const center = viewDate.getFullYear();
    const start = center - 100;
    const end = center + 100;
    const years: number[] = [];
    for (let y = start; y <= end; y++) years.push(y);
    return years;
  }, [viewDate]);

  useEffect(() => {
    if (viewMode !== "years" || !open || !yearGridRef.current) return;
    const el = yearGridRef.current.querySelector(`[data-year="${viewDate.getFullYear()}"]`) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ block: "center", inline: "center" });
      // Also center in nearest scrollable container
      const container = yearGridRef.current;
      const elRect = el.getBoundingClientRect();
      const contRect = container.getBoundingClientRect();
      const offset = elRect.top - contRect.top - contRect.height / 2 + elRect.height / 2;
      container.scrollTop += offset;
    }
  }, [viewMode, open, viewDate]);

  return (
    <div ref={wrapperRef} className={`${styles.wrapper} ${className ?? ""}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel ?? display}
      >
        <span className={styles.icon} aria-hidden="true">
          <CalendarDays size={16} strokeWidth={2} />
        </span>
        <span className={parsed ? styles.label : styles.placeholder}>{display || placeholder || "Select date"}</span>
      </button>
      <input
        type="date"
        value={value}
        onChange={(e) => {
          if (e.target.value) {
            const p = parseISODate(e.target.value);
            if (p && !Number.isNaN(p.getTime())) onChange(e.target.value);
          } else onChange("");
        }}
        className={styles.hiddenInput}
        tabIndex={-1}
        aria-hidden="true"
      />
      {open &&
        mounted &&
        createPortal(
          <div className={isDark ? "themeDark" : "themeLight"}>
            <div ref={menuRef} className={styles.menu} style={menuStyle} role="dialog" aria-modal="false">
              <div className={styles.header}>
                {viewMode === "days" && (
                  <>
                    <button type="button" className={styles.navButton} onClick={handlePrev} aria-label="Previous month">
                      <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={styles.monthLabelButton}
                      onClick={() => setViewMode("months")}
                      aria-label="Choose month and year"
                    >
                      {monthLabel}
                    </button>
                    <button type="button" className={styles.navButton} onClick={handleNext} aria-label="Next month">
                      <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
                    </button>
                  </>
                )}
                {viewMode === "months" && (
                  <>
                    <button type="button" className={styles.navButton} onClick={handleYearPrev} aria-label="Previous year">
                      <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={styles.monthLabelButton}
                      onClick={() => setViewMode("years")}
                      aria-label="Choose year"
                    >
                      {viewDate.getFullYear()}
                    </button>
                    <button type="button" className={styles.navButton} onClick={handleYearNext} aria-label="Next year">
                      <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
                    </button>
                  </>
                )}
                {viewMode === "years" && (
                  <>
                    <button type="button" className={styles.navButton} onClick={() => setViewMode("months")} aria-label="Back to months">
                      <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
                    </button>
                    <span className={styles.monthLabel}>Select year</span>
                    <button
                      type="button"
                      className={styles.navButton}
                      style={{ visibility: "hidden" }}
                      tabIndex={-1}
                      aria-hidden="true"
                    >
                      <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>

              {viewMode === "days" && (
                <>
                  <div className={styles.weekdays}>
                    {weekdayNames.map((wd, idx) => (
                      <span key={idx} className={styles.weekday}>
                        {wd}
                      </span>
                    ))}
                  </div>
                  <div className={styles.grid}>
                    {calendarDays.map((d, idx) => {
                      const isCurrentMonth = d.getMonth() === viewDate.getMonth();
                      const isSelected = isSameDay(d, parsed);
                      const isToday = isSameDay(d, today) && !isSelected;
                      return (
                        <button
                          key={idx}
                          type="button"
                          className={[styles.day, !isCurrentMonth ? styles.dayOutside : "", isSelected ? styles.daySelected : "", isToday ? styles.dayToday : ""]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={() => {
                            onChange(toISODate(d));
                            setOpen(false);
                          }}
                        >
                          {d.getDate()}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {viewMode === "months" && (
                <div className={styles.monthGrid}>
                  {monthGrid.map((m) => {
                    const isSelected = m.isSelectedMonth;
                    const isCurrent = m.isCurrentMonth && !isSelected;
                    const isViewing = m.isViewingMonth && !isSelected;
                    return (
                      <button
                        key={m.idx}
                        type="button"
                        className={[
                          styles.monthCell,
                          isSelected ? styles.monthCellSelected : "",
                          isCurrent ? styles.monthCellCurrent : "",
                          isViewing && !isCurrent && !isSelected ? styles.monthCellViewing : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => handleMonthSelect(m.idx)}
                      >
                        {m.abbr}
                      </button>
                    );
                  })}
                </div>
              )}

              {viewMode === "years" && (
                <div ref={yearGridRef} className={styles.yearGrid}>
                  {yearRange.map((y) => {
                    const isSelected = parsed ? parsed.getFullYear() === y : false;
                    const isCurrent = today.getFullYear() === y && !isSelected;
                    const isViewing = viewDate.getFullYear() === y && !isSelected && !isCurrent;
                    return (
                      <button
                        key={y}
                        type="button"
                        data-year={y}
                        className={[
                          styles.yearCell,
                          isSelected ? styles.yearCellSelected : "",
                          isCurrent ? styles.yearCellCurrent : "",
                          isViewing ? styles.yearCellViewing : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => handleYearSelect(y)}
                      >
                        {y}
                      </button>
                    );
                  })}
                </div>
              )}

              {viewMode === "days" ? (
                <div className={styles.footer}>
                  <button type="button" className={`${styles.footerButton} ${styles.clearButton}`} onClick={handleClear}>
                    {tClear}
                  </button>
                  <button type="button" className={styles.footerButton} onClick={handleToday}>
                    {tToday}
                  </button>
                </div>
              ) : (
                <div className={styles.footer} style={{ justifyContent: "center", borderTop: "none", paddingTop: 4, marginTop: 4 }}>
                  <button type="button" className={styles.footerButton} onClick={() => setViewMode("days")}>
                    Back
                  </button>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
