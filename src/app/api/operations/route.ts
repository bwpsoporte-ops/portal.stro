import { NextResponse } from "next/server";
import { getAccountingReport } from "@/lib/server/accounting-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const report = await getAccountingReport({ from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined, search: url.searchParams.get("search") ?? undefined, status: url.searchParams.get("status") ?? undefined, source: url.searchParams.get("source") ?? undefined });
    return NextResponse.json({ ok: true, ...report }, {
      headers: { "cache-control": "no-store, max-age=0" },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "No se pudo cargar la información operativa." }, { status: 500 });
  }
}
