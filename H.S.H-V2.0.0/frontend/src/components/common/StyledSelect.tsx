"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import styles from "./StyledSelect.module.css";

export type SelectOption = {
  value: string;
  label: string;
  sublabel?: string;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  fitContent?: boolean;
  maxMenuHeight?: string | number;
};

export default function StyledSelect({ value, onChange, options, placeholder, ariaLabel, disabled, fitContent, maxMenuHeight }: Props) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState<number>(-1);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
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

  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value]);

  const computePosition = () => {
    if (!triggerRef.current || !menuRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuRect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const gap = 8;
    const viewportPadding = 8;
    const availableWidth = viewportWidth - viewportPadding * 2;
    const desiredMin = 200;
    const popoverWidth = Math.min(Math.max(rect.width, desiredMin), availableWidth);
    const popoverHeight = menuRect.height || 200;

    let top = rect.bottom + gap;
    let left = rect.left;

    const spaceBelow = viewportHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;

    if (top + popoverHeight > viewportHeight - 8 && spaceAbove > spaceBelow) {
      top = rect.top - popoverHeight - gap;
    }
    if (top < 8) top = 8;
    if (top + popoverHeight > viewportHeight - 8) {
      top = Math.max(8, viewportHeight - popoverHeight - 8);
    }
    if (left + popoverWidth > viewportWidth - viewportPadding) {
      left = viewportWidth - popoverWidth - viewportPadding;
    }
    if (left < viewportPadding) left = viewportPadding;

    setMenuStyle({
      top: `${top}px`,
      left: `${left}px`,
      width: `${popoverWidth}px`,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      computePosition();
      requestAnimationFrame(() => computePosition());
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleResize = () => computePosition();
    const handleScroll = (e: Event) => {
      const target = e.target as Node | null;
      // Don't close when scrolling inside the dropdown menu itself (wheel/scrollbar/touchpad)
      if (target && menuRef.current) {
        if (target === menuRef.current || (target instanceof Node && menuRef.current.contains(target))) return;
      }
      setOpen(false);
    };
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, true);
    document.addEventListener("scroll", handleScroll, true);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("scroll", handleScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setHighlighted(-1);
      return;
    }
    const idx = value ? options.findIndex((o) => o.value === value) : -1;
    setHighlighted(idx >= 0 ? idx : 0);
  }, [open, value, options]);

  useEffect(() => {
    if (!open) return;
    function isInsideRef(ref: React.RefObject<HTMLElement | null>, target: Node, path: Node[] | undefined) {
      if (!ref.current) return false;
      if (ref.current.contains(target)) return true;
      if (path && path.includes(ref.current)) return true;
      if (path && path.some((n) => n instanceof Node && ref.current!.contains(n))) return true;
      return false;
    }
    function handleOutside(e: MouseEvent) {
      const target = e.target as Node;
      const path = (e as unknown as { composedPath?: () => EventTarget[] }).composedPath?.() as Node[] | undefined;
      if (isInsideRef(wrapperRef, target, path)) return;
      if (isInsideRef(triggerRef, target, path)) return;
      if (isInsideRef(menuRef, target, path)) return;
      // Portal menu is fixed; also check direct contains via path for scrollbar/thumb edge cases
      if (menuRef.current && path) {
        for (const node of path) {
          if (node === menuRef.current) return;
          if (node instanceof HTMLElement && menuRef.current.contains(node)) return;
        }
      }
      setOpen(false);
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // Close dropdown first and prevent modal Escape from also closing the modal
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    // Use both mousedown and pointerdown to capture scrollbar thumb interactions reliably across browsers
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("pointerdown", handleOutside as unknown as EventListener);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("pointerdown", handleOutside as unknown as EventListener);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((prev) => {
        const next = prev + 1;
        return next >= options.length ? 0 : next;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((prev) => {
        const next = prev - 1;
        return next < 0 ? options.length - 1 : next;
      });
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (highlighted >= 0 && highlighted < options.length) {
        const opt = options[highlighted];
        onChange(opt.value);
        setOpen(false);
      } else if (selected) {
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  useEffect(() => {
    if (!open || highlighted < 0 || !menuRef.current) return;
    const el = menuRef.current.querySelectorAll(`.${styles.option}`)[highlighted] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlighted, open]);

  return (
    <div ref={wrapperRef} className={styles.wrapper}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ""}`}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
      >
        {selected ? (
          <span className={styles.value}>{selected.label}</span>
        ) : (
          <span className={styles.placeholder}>{placeholder ?? "Select"}</span>
        )}
        <span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`} aria-hidden="true">
          <ChevronDown size={14} strokeWidth={2} />
        </span>
      </button>

      {open &&
        mounted &&
        createPortal(
          <div className={isDark ? "themeDark" : "themeLight"}>
            <div
              ref={menuRef}
              className={styles.menu}
              style={{
                ...menuStyle,
                ...(fitContent ? ({ maxHeight: "none", overflowY: "visible" as const, height: "auto" } as React.CSSProperties) : {}),
                ...(maxMenuHeight !== undefined
                  ? ({
                      maxHeight: typeof maxMenuHeight === "number" ? `${maxMenuHeight}px` : maxMenuHeight,
                    } as React.CSSProperties)
                  : {}),
              }}
              role="listbox"
              aria-label={ariaLabel}
            >
              {options.length === 0 ? (
                <div className={styles.empty}>No options</div>
              ) : (
                options.map((opt, idx) => {
                  const isSelected = opt.value === value;
                  const isHighlighted = idx === highlighted;
                  return (
                    <div
                      key={opt.value + idx}
                      role="option"
                      aria-selected={isSelected}
                      tabIndex={-1}
                      className={[
                        styles.option,
                        isSelected ? styles.optionSelected : "",
                        isHighlighted && !isSelected ? styles.optionHighlighted : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onMouseEnter={() => setHighlighted(idx)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onChange(opt.value);
                        setOpen(false);
                      }}
                      onClick={() => {
                        onChange(opt.value);
                        setOpen(false);
                      }}
                    >
                      <span className={styles.optionLabel}>{opt.label}</span>
                      {opt.sublabel && <span className={styles.optionSub}>{opt.sublabel}</span>}
                    </div>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
