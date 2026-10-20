// Approve / Reject for one scorecard. Used in the review queue and on a pending scorecard page.
import { reviewVisit } from "@/app/(ux)/manager/review/actions";

export function ReviewButtons({ id }: { id: string }) {
  return (
    <form action={reviewVisit} className="flex gap-2">
      <input type="hidden" name="id" value={id} />
      <button name="decision" value="approved" className="flex-1 rounded-lg bg-good px-3 py-2 text-sm font-medium text-paper">
        Approve
      </button>
      <button name="decision" value="rejected" className="flex-1 rounded-lg border border-bad/40 px-3 py-2 text-sm font-medium text-bad">
        Reject
      </button>
    </form>
  );
}
