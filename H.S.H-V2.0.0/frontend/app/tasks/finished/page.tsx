"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Retired route: completed tasks now live in the main /tasks table behind
 * the Completed status filter. Old /tasks/finished links redirect there with
 * the filter preselected (main page reads ?status=completed on mount), so no
 * deep link breaks.
 */
export default function FinishedTasksRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/tasks?status=completed");
  }, [router]);

  return null;
}
