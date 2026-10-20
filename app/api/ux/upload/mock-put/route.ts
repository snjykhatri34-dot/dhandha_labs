// PUT /api/ux/upload/mock-put?token=…: the mock stand-in for Supabase's signed upload URL.
// Writes the clip to .uploads/. Disabled (404) when DATA_SOURCE=supabase.
import { NextResponse, type NextRequest } from "next/server";
import { writeMockUpload } from "@/lib/storage/mock";

export async function PUT(req: NextRequest) {
  if (process.env.DATA_SOURCE === "supabase") return new NextResponse(null, { status: 404 });
  const token = req.nextUrl.searchParams.get("token") ?? "";
  try {
    const path = await writeMockUpload(token, new Uint8Array(await req.arrayBuffer()));
    return NextResponse.json({ ok: true, path });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
