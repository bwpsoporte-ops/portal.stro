import { NextResponse } from "next/server";
import { createCreditNotePdf } from "@/lib/server/credit-notes";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const pdf = await createCreditNotePdf(id);
    return new NextResponse(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="nota-credito-${id}.pdf"`, "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "No se pudo generar el PDF." }, { status: 404 });
  }
}
