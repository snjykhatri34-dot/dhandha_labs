// Dumb component: renders a ReportView. No data access.
import Link from "next/link";
import type { ReportSectionView, ReportView } from "./view";

function Section({ section }: { section: ReportSectionView }) {
  return (
    <section className="rounded-xl border border-line p-4">
      <h2 className="font-semibold">{section.title}</h2>
      {section.summary && <p className="mt-1 text-sm text-muted">{section.summary}</p>}
      {section.rows && (
        <ul className="mt-3 space-y-1.5">
          {section.rows.map((row) => (
            <li key={row.label} className="relative overflow-hidden rounded-md px-2 py-1 text-sm">
              {row.share !== undefined && (
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 rounded-md bg-line"
                  style={{ width: `${Math.max(2, Math.round(row.share * 100))}%` }}
                />
              )}
              <span className="relative flex justify-between gap-3">
                <span>{row.label}</span>
                <span className="tabular-nums">
                  {row.value}
                  {row.note && <span className="ml-2 text-muted">{row.note}</span>}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {section.visitIds && section.visitIds.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted">Show {section.visitIds.length} visits</summary>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {section.visitIds.map((id) => (
              <li key={id}>
                <Link href={`/owner/visits/${id}`} className="rounded bg-line px-1.5 py-0.5 font-mono text-xs hover:underline">
                  {id}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
      {section.action && (
        <p className="mt-3 rounded-lg bg-info-bg px-3 py-2 text-sm font-medium text-info">→ {section.action}</p>
      )}
    </section>
  );
}

export function DailyReportView({ view, sourceCount }: { view: ReportView; sourceCount: number }) {
  return (
    <article className="space-y-4">
      <header>
        <p className="text-xs uppercase tracking-wide text-muted">{view.title}</p>
        <p className="mt-1 text-lg font-medium leading-snug">{view.headline}</p>
      </header>
      <dl className="grid grid-cols-3 gap-2">
        {view.kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-line p-3">
            <dt className="text-xs text-muted">{k.label}</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums leading-tight">{k.value}</dd>
            {k.sub && <dd className="text-xs text-muted">{k.sub}</dd>}
          </div>
        ))}
      </dl>
      {view.sections.map((s) => (
        <Section key={s.key} section={s} />
      ))}
      <p className="text-xs text-muted">Sources: {sourceCount} analysed visits. Tap any visit id to see its scorecard.</p>
    </article>
  );
}
