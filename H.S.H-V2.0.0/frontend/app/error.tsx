"use client";

import { useEffect } from "react";
import AppErrorPage from "../src/components/common/AppErrorPage";

/** Route-segment error boundary: catches render failures, offers Next.js retry recovery. */
export default function Error({
  error,
  retry,
  reset,
}: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset?: () => void;
}) {
  const recover = retry ?? reset ?? (() => {});
  useEffect(() => {
    // Diagnostics only — never rendered to users.
    try {
      console.error("[app-error-boundary]", error?.digest || error?.message || error);
    } catch {}
  }, [error]);
  return <AppErrorPage kind="error" onRetry={() => recover()} />;
}
