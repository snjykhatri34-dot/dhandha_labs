// Dumb component: renders one visit's scorecard. No data access.
import type { ReactNode } from "react";
import { Badge, ErrorState, OutcomeBadge, ReviewBadge, StatusPill } from "@/components/ux/shared";
import type { Visit } from "@/lib/data/types";
import { timelineKindLabel, type Tone, type VisitView } from "./view";

const DOT: Record<Tone, string> = {
  good: "bg-good",
  bad: "bg-bad",
  warn: "bg-warn",
  neutral: "bg-muted",
};

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line p-4">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-2 text-sm">{children}</div>
    </section>
  );
}

function ScoreDots({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={`Handling score ${score} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`size-2.5 rounded-full ${i <= score ? (score >= 4 ? "bg-good" : score === 3 ? "bg-warn" : "bg-bad") : "bg-line"}`} />
      ))}
      <span className="ml-1.5 font-semibold tabular-nums">{score}/5</span>
    </span>
  );
}

export function VisitScorecard({ visit, view }: { visit: Visit; view: VisitView }) {
  return (
    <article className="space-y-4">
      <header>
        <p className="font-mono text-xs text-muted">{view.id}</p>
        <h1 className="text-xl font-semibold">{view.heading}</h1>
        <p className="text-sm text-muted">{view.when}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {visit.status !== "analysed" && <StatusPill status={visit.status} />}
          <OutcomeBadge outcome={visit.outcome} />
          {view.lostDemand && <Badge tone="bad">Lost demand</Badge>}
          <ReviewBadge status={visit.review.status} />
        </div>
      </header>

      {visit.status === "failed" && (
        <ErrorState title="Analysis failed" message={visit.error ?? "No reason given."} />
      )}

      {visit.status === "analysed" && (
        <>
          <Card title="Outcome and why">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {view.askedFor && (
                <>
                  <dt className="text-muted">Asked for</dt>
                  <dd>{view.askedFor}</dd>
                </>
              )}
              {view.shown.length > 0 && (
                <>
                  <dt className="text-muted">Shown</dt>
                  <dd>{view.shown.join(", ")}</dd>
                </>
              )}
              {view.reason && (
                <>
                  <dt className="text-muted">Why not bought</dt>
                  <dd className="font-medium">{view.reason}</dd>
                </>
              )}
              {view.value && (
                <>
                  <dt className="text-muted">Sale value</dt>
                  <dd>{view.value}</dd>
                </>
              )}
              {view.facts.map((f) => (
                <FactRow key={f.label} label={f.label} value={f.value} />
              ))}
            </dl>
          </Card>

          {view.handling && (
            <Card title="Handling">
              <ScoreDots score={view.handling.score} />
              {view.handling.evidence && <p className="mt-2 text-muted">{view.handling.evidence}</p>}
              {view.handling.tip && (
                <p className="mt-3 rounded-lg bg-info-bg px-3 py-2 font-medium text-info">Coaching: {view.handling.tip}</p>
              )}
            </Card>
          )}

          {(view.customer || view.emotionArc) && (
            <Card title="Customer">
              {view.customer && <p>{view.customer.line}</p>}
              {view.customer?.evidence && <p className="mt-0.5 text-muted">{view.customer.evidence}</p>}
              {view.emotionArc && <p className="mt-2">Mood: {view.emotionArc}</p>}
            </Card>
          )}

          {view.timeline.length > 0 && (
            <Card title="What happened, in order">
              <ol className="relative space-y-3 border-l border-line pl-4">
                {view.timeline.map((t, i) => (
                  <li key={`${t.kind}-${t.at}-${i}`} className="relative">
                    <span className={`absolute -left-[21px] top-1.5 size-2.5 rounded-full ${DOT[t.tone]}`} aria-hidden />
                    <p className="text-xs text-muted">
                      <span className="font-mono">@{t.at}</span> · {timelineKindLabel(t.kind)}
                    </p>
                    <p className="font-medium">{t.title}</p>
                    {t.detail && <p className="text-muted">{t.detail}</p>}
                    {t.cue && <p className="text-xs text-muted">Cue: {t.cue}</p>}
                  </li>
                ))}
              </ol>
            </Card>
          )}

          {view.summaryOnly && (
            <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
              Summary-only visit from the sample day: there are no objections, emotions or coaching notes to show.
            </p>
          )}

          {view.flags.length > 0 && (
            <Card title="Flags">
              <ul className="list-disc space-y-1 pl-5 text-muted">
                {view.flags.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </article>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
