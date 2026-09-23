"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Canonical workflow is /purchases/entry — this route is obsolete.
// Preserve compatibility for old bookmarks via client redirect.
export default function PurchaseNewRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/purchases/entry");
  }, [router]);
  return (
    <div style={{ padding: 24, color: "var(--muted)", fontSize: 13 }}>
      Redirecting to purchase entry…
    </div>
  );
}
