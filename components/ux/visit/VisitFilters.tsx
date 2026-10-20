"use client";

// A plain GET form, so filters live in the URL. Changing a dropdown submits it.
import Link from "next/link";
import type { VisitFilter } from "@/lib/data/types";

const OUTCOME_LABEL: Record<string, string> = {
  bought: "Bought",
  deferred_with_follow_up: "Needs follow-up",
  walked_out: "Walked out",
};

interface Props {
  value: VisitFilter;
  options: { stores: string[]; salespeople: string[]; dates: string[]; outcomes: string[] };
}

function Select({ name, label, value, choices }: { name: string; label: string; value?: string; choices: [string, string][] }) {
  return (
    <label className="flex flex-col gap-0.5 text-xs text-muted">
      {label}
      <select
        name={name}
        defaultValue={value ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-lg border border-line bg-paper px-2 py-1.5 text-sm text-ink"
      >
        <option value="">All</option>
        {choices.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

export function VisitFilters({ value, options }: Props) {
  const active = Object.values(value).some(Boolean);
  return (
    // key resets the uncontrolled selects when the URL changes (e.g. "Clear").
    <form key={JSON.stringify(value)} action="/owner#visits" method="get" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Select name="date" label="Date" value={value.date} choices={options.dates.map((d) => [d, d])} />
      <Select name="store" label="Store" value={value.store} choices={options.stores.map((s) => [s, s])} />
      <Select name="salesperson" label="Salesperson" value={value.salesperson} choices={options.salespeople.map((s) => [s, s])} />
      <Select
        name="outcome"
        label="Outcome"
        value={value.outcome}
        choices={options.outcomes.map((o) => [o, OUTCOME_LABEL[o] ?? o])}
      />
      <noscript>
        <button className="rounded-lg bg-ink px-3 py-1.5 text-sm text-paper">Apply</button>
      </noscript>
      {active && (
        <Link href="/owner#visits" className="col-span-full text-xs text-muted underline">
          Clear filters
        </Link>
      )}
    </form>
  );
}
