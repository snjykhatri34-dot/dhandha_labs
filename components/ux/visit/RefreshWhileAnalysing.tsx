"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Spinner } from "@/components/ux/shared";

/** Re-renders the server page every 2 s until the visit leaves "uploaded". */
export function RefreshWhileAnalysing() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(timer);
  }, [router]);
  return (
    <p className="flex items-center gap-2 rounded-xl border border-line p-4 text-sm text-muted">
      <Spinner /> Analysing the clip. The scorecard appears here when it&apos;s ready.
    </p>
  );
}
