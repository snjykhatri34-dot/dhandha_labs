"use client";

import { ErrorState } from "@/components/ux/shared";

export default function UxError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <ErrorState
      title="Couldn't load this page"
      message={error instanceof Error ? error.message : undefined}
      action={
        <button onClick={() => retry()} className="rounded-lg bg-ink px-3 py-1.5 text-sm text-paper">
          Try again
        </button>
      }
    />
  );
}
