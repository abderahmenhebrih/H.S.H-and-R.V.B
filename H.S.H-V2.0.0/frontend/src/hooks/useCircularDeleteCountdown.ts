"use client";

import { useEffect, useRef, useState } from "react";

export const DELETE_COUNTDOWN_MS = 3500;

export function useCircularDeleteCountdown(
  isOpen: boolean,
  resetKey?: string | null,
) {
  const [remainingMs, setRemainingMs] = useState(DELETE_COUNTDOWN_MS);
  const startRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  // derived
  const remainingSec = remainingMs / 1000;
  // display with one decimal, ceil to show depletion similar to purchases
  const displaySec =
    remainingMs <= 0 ? 0 : Math.ceil(remainingMs / 100) / 10;
  const isReady = remainingMs <= 0;

  useEffect(() => {
    if (!isOpen) {
      startRef.current = null;
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // reset on open or key change
    startRef.current = Date.now();
    setRemainingMs(DELETE_COUNTDOWN_MS);

    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
    }

    intervalRef.current = window.setInterval(() => {
      if (startRef.current === null) return;
      const elapsed = Date.now() - startRef.current;
      const remaining = Math.max(0, DELETE_COUNTDOWN_MS - elapsed);
      setRemainingMs(remaining);
      if (remaining <= 0 && intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }, 50);

    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      startRef.current = null;
    };
  }, [isOpen, resetKey]);

  // Also watch resetKey separately to restart if entity changes while open
  // (covered by dependency, but explicit cleanup already)

  const canConfirm = (elapsedOverride?: number) => {
    if (startRef.current === null) return isReady;
    const elapsed = Date.now() - startRef.current;
    return elapsed >= DELETE_COUNTDOWN_MS;
  };

  return {
    remainingMs,
    remainingSec,
    displaySec,
    isReady,
    canConfirm,
    startRef,
  };
}
