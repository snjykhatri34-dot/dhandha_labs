// Server component: loads visits for /owner through lib/data. Wrap in <Suspense>.
import Link from "next/link";
import { connection } from "next/server";
import { visits } from "@/lib/data";
import { filterOptions, PAGE_SIZE, parseVisitFilters, type SearchParams } from "./filters";
import { ScrollToHash } from "@/components/ux/shared/ScrollToHash";
import { VisitFilters } from "./VisitFilters";
import { VisitList } from "./VisitList";

export async function OwnerVisits({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection();
  const sp = await searchParams;
  const { filter, showAll } = parseVisitFilters(sp);
  const [all, matching] = await Promise.all([visits.list(), visits.list(filter)]);
  const shown = showAll ? matching : matching.slice(0, PAGE_SIZE);
  const pending = matching.filter((v) => v.review.status === "pending").length;

  const showAllHref = `/owner?${new URLSearchParams({ ...Object.fromEntries(Object.entries(filter).filter(([, v]) => v)), all: "1" })}#visits`;

  return (
    <div className="space-y-3">
      <ScrollToHash id="visits" />
      <VisitFilters value={filter} options={filterOptions(all, filter.store)} />
      <p className="text-xs text-muted">
        {matching.length} visits{pending > 0 && ` · ${pending} pending review`}
      </p>
      <VisitList visits={shown} />
      {shown.length < matching.length && (
        <Link href={showAllHref} className="block text-center text-sm text-muted underline">
          Show all {matching.length}
        </Link>
      )}
    </div>
  );
}
