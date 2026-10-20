import Link from "next/link";

const STEPS = [
  { href: "/upload", title: "1. Upload a counter clip", who: "Staff", note: "Store, salesperson, time and a 1–5 minute clip." },
  { href: "/owner", title: "2. Read today's report", who: "Owner", note: "Why people bought or walked out, with one action per section." },
  { href: "/manager/review", title: "3. Review scorecards", who: "Manager", note: "Approve before staff see them." },
  { href: "/ux-debug", title: "Data layer check", who: "Dev", note: "Every visit the app can see." },
];

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
