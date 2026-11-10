"use client";

import AppErrorPage from "../src/components/common/AppErrorPage";

/** App Router 404: unknown URLs and unmatched nested routes. */
export default function NotFound() {
  return <AppErrorPage kind="notFound" />;
}
