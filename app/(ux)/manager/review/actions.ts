"use server";

import { refresh } from "next/cache";
import { canReview } from "@/components/ux/review/visibility";
import { visits } from "@/lib/data";
import { getRole } from "@/lib/ux/role";

export async function reviewVisit(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!id || (decision !== "approved" && decision !== "rejected")) return;
  // Demo role switch, not auth: still refuse decisions from the staff view.
  const role = await getRole();
  if (!canReview(role)) return;
  await visits.setReview(id, decision, role);
  refresh();
}
