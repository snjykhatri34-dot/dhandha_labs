import Link from "next/link";

const STEPS = [
  { href: "/upload", title: "1. Upload a counter clip", who: "Staff", note: "Store, salesperson, time and a clip of up to 5 minutes." },
  { href: "/owner#visits", title: "2. See the scorecard", who: "Owner", note: "Outcome, why, objections, emotions with cues, handling score and coaching." },
  { href: "/manager/review", title: "3. Approve it", who: "Manager", note: "Scorecards reach staff only after a manager approves them." },
  { href: "/owner", title: "4. Read the daily report", who: "Owner", note: "Why people bought or walked out, with one action per section." },
  { href: "/staff", title: "5. Staff see their coaching", who: "Staff", note: "Approved scorecards only. Never the sole basis for pay." },
]

export default function Home() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Counter Intelligence</h1>
      <p className="mt-1 text-muted">Why customers at Verma Jewellers bought or walked out, every day.</p>
      <ul className="mt-6 grid gap-3">
        {STEPS.map((s) => (
          <li key={s.href}>
            <Link href={s.href} className="block rounded-xl border border-line p-4 hover:border-ink">
              <span className="text-xs uppercase tracking-wide text-muted">{s.who}</span>
              <span className="mt-0.5 block font-medium">{s.title}</span>
              <span className="mt-0.5 block text-sm text-muted">{s.note}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
