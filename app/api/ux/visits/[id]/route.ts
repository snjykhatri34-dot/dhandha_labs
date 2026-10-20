// GET /api/ux/visits/[id]: the visit's processing status, polled by the upload page.
import { NextResponse, type NextRequest } from "next/server";
import { visits } from "@/lib/data";
import type { VisitStatus } from "@/lib/types/scorecard";

export type VisitStatusResponse =
  | { ok: true; id: string; status: VisitStatus; error: string | null }
  | { ok: false; error: string };

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/ux/visits/[id]">) {
  // Awaiting params is request-time data, so this always runs per request (never prerendered).
  const { id } = await ctx.params;
  try {
    const v = await visits.get(id);
    if (!v) return NextResponse.json<VisitStatusResponse>({ ok: false, error: `Visit ${id} not found.` }, { status: 404 });
    return NextResponse.json<VisitStatusResponse>({ ok: true, id: v.id, status: v.status, error: v.error });
  } catch (e) {
    return NextResponse.json<VisitStatusResponse>(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
