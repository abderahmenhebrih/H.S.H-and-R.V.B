"use client";

import RvbAuthGuard from "../../src/components/rvb/RvbAuthGuard";

export default function RvbLayout({ children }: { children: React.ReactNode }) {
  return <RvbAuthGuard>{children}</RvbAuthGuard>;
}
