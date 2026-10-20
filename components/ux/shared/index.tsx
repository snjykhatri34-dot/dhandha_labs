// Shared, dumb UI primitives. Data comes in via props only.
import type { ReactNode } from "react";
import type { ReviewStatus } from "@/lib/data/types";
import type { Outcome, VisitStatus } from "@/lib/types/scorecard";

type Tone = "neutral" | "good" | "warn" | "bad" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-line text-ink",
  good: "bg-good-bg text-good",
  warn: "bg-warn-bg text-warn",
  bad: "bg-bad-bg text-bad",
  info: "bg-info-bg text-info",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone]}`}>
      {children}
    </span>
  );
}

const OUTCOME_LABEL: Record<Outcome, [string, Tone]> = {
  bought: ["Bought", "good"],
  deferred_with_follow_up: ["Follow up", "warn"],
  walked_out: ["Walked out", "bad"],
};

export function OutcomeBadge({ outcome }: { outcome: Outcome | null }) {
  if (!outcome) return <Badge>No outcome yet</Badge>;
  const [label, tone] = OUTCOME_LABEL[outcome];
  return <Badge tone={tone}>{label}</Badge>;
}

/** Processing status. `uploaded` reads as "Analysing" while Stream 1 runs. */
export function StatusPill({ status }: { status: VisitStatus }) {
  if (status === "analysed") return <Badge tone="good">Analysed</Badge>;
  if (status === "failed") return <Badge tone="bad">Analysis failed</Badge>;
  return (
    <Badge tone="info">
      <Spinner className="mr-1 size-3" /> Analysing
    </Badge>
  );
}

export function ReviewBadge({ status }: { status: ReviewStatus }) {
  if (status === "approved") return null;
  return status === "pending" ? <Badge tone="warn">Pending review</Badge> : <Badge tone="bad">Rejected</Badge>;
}

export function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
    />
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line p-8 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", message, action }: { title?: string; message?: string; action?: ReactNode }) {
  return (
    <div role="alert" className="rounded-xl border border-bad/30 bg-bad-bg p-5">
      <p className="font-medium text-bad">{title}</p>
      {message && <p className="mt-1 text-sm">{message}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 p-6 text-sm text-muted">
      <Spinner /> {label}
    </div>
  );
}
