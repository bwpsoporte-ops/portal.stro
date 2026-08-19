import { NextResponse } from "next/server";
import { createAccountingReportPdf } from "@/lib/server/accounting-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const from = url.searchParams.get("from") ?? undefined;
    const to = url.searchParams.get("to") ?? undefined;
    const pdf = await createAccountingReportPdf({ from, to, search: url.searchParams.get("search") ?? undefined, status: url.searchParams.get("status") ?? undefined, source: url.searchParams.get("source") ?? undefined });
    return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="reporte-contable-${from ?? "inicio"}-${to ?? "hoy"}.pdf"`, "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "No se pudo generar el reporte contable." }, { status: 500 });
  }
}
