// Dumb component: renders one visit's scorecard. No data access.
import type { ReactNode } from "react";
import { ErrorState, ReviewBadge, StatusPill } from "@/components/ux/shared";
import type { Visit } from "@/lib/data/types";
import type { Row, Tone, VisitView } from "./view";

const BANNER: Record<Tone, string> = {
  good: "border-good/30 bg-good-bg text-good",
  bad: "border-bad/30 bg-bad-bg text-bad",
  warn: "border-warn/30 bg-warn-bg text-warn",
  neutral: "border-line bg-line/40 text-ink",
};

const TAG: Record<Tone, string> = {
  good: "bg-good-bg text-good",
  bad: "bg-bad-bg text-bad",
  warn: "bg-warn-bg text-warn",
  neutral: "bg-line text-ink",
};

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
      <div className="mt-2 text-sm">{children}</div>
    </section>
  );
}

function Rows({ rows }: { rows: Row[] }) {
  return (
    <dl className="divide-y divide-line">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[minmax(7rem,40%)_1fr] gap-3 py-2 first:pt-0 last:pb-0">
          <dt className="text-muted">{r.label}</dt>
          <dd>
            {r.value}
            {r.note && <span className="mt-0.5 block text-xs text-muted">{r.note}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ScoreMeter({ score, word }: { score: number; word: string }) {
  const color = score >= 4 ? "bg-good" : score === 3 ? "bg-warn" : "bg-bad";
  return (
    <div className="flex items-center gap-3" aria-label={`Handling: ${word}, ${score} out of 5`}>
      <div className="flex flex-1 gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`h-2 flex-1 rounded-full ${i <= score ? color : "bg-line"}`} />
        ))}
      </div>
      <span className="whitespace-nowrap font-semibold">
        {word} <span className="font-normal text-muted tabular-nums">{score}/5</span>
      </span>
    </div>
  );
}

export function VisitScorecard({ visit, view, showNotes }: { visit: Visit; view: VisitView; showNotes: boolean }) {
  return (
    <article className="space-y-3">
      <header className="mb-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold leading-tight">{view.heading}</h1>
            <p className="text-sm text-muted">{view.when}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="font-mono text-xs text-muted">{view.id}</span>
            <ReviewBadge status={visit.review.status} />
          </div>
        </div>
      </header>

      {visit.status === "uploaded" && (
        <div className="flex items-center gap-2">
          <StatusPill status="uploaded" />
        </div>
      )}

      {visit.status === "failed" && (
        <ErrorState title="We couldn't analyse this clip" message={visit.error ?? "No reason was given."} />
      )}

      {visit.status === "analysed" && (
        <>
          <section className={`rounded-2xl border p-4 ${BANNER[view.summary.tone]}`}>
            <p className="text-lg font-semibold">{view.summary.title}</p>
            {view.summary.line && <p className="mt-1 text-sm text-ink">{view.summary.line}</p>}
            {view.lostDemand && (
              <p className="mt-2 text-xs font-medium">We didn&apos;t have, or didn&apos;t show, what they asked for.</p>
            )}
          </section>

          {view.handling && (
            <Card title="How the salesperson handled it">
              <ScoreMeter score={view.handling.score} word={view.handling.word} />
              {view.handling.why && <p className="mt-3 text-muted">{view.handling.why}</p>}
              {view.handling.tip && (
                <div className="mt-3 rounded-xl bg-info-bg px-3 py-2.5 text-info">
                  <p className="text-xs font-semibold uppercase tracking-wide">Coaching tip</p>
                  <p className="mt-0.5 font-medium">{view.handling.tip}</p>
                </div>
              )}
            </Card>
          )}

          {view.nextStep.length > 0 && (
            <Card title="Next step">
              <Rows rows={view.nextStep} />
            </Card>
          )}

          {view.details.length > 0 && (
            <Card title="The visit">
              <Rows rows={view.details} />
            </Card>
          )}

          {view.customer.length > 0 && (
            <Card title="The customer">
              <Rows rows={view.customer} />
            </Card>
          )}

          {view.price.length > 0 && (
            <Card title="Price talk">
              <Rows rows={view.price} />
            </Card>
          )}

          {view.timeline.length > 0 && (
            <Card title="What happened, minute by minute">
              <ol className="space-y-3">
                {view.timeline.map((t, i) => (
                  <li key={`${t.tag}-${t.at}-${i}`} className="grid grid-cols-[2.75rem_1fr] gap-2">
                    <span className="pt-0.5 font-mono text-xs text-muted tabular-nums">{t.time}</span>
                    <div>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${TAG[t.tone]}`}>{t.tag}</span>
                      <p className="mt-1">{t.text}</p>
                      {t.detail && <p className="text-xs text-muted">{t.detail}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          )}

          {view.summaryOnly && (
            <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted">
              This visit only has a summary, so there&apos;s no minute-by-minute breakdown or coaching tip.
            </p>
          )}

          {showNotes && view.notes.length > 0 && (
            <details className="rounded-2xl border border-line p-4 text-sm">
              <summary className="cursor-pointer font-medium">Points to double-check ({view.notes.length})</summary>
              <p className="mt-2 text-xs text-muted">
                The analysis wasn&apos;t fully sure about these. Check the recording before acting on them.
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
                {view.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </article>
  );
}
