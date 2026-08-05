import { NextResponse } from "next/server";
import { createCreditNote, getCreditNoteData } from "@/lib/server/credit-notes";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...(await getCreditNoteData()) });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "No se pudieron cargar las notas de crédito." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    return NextResponse.json({ ok: true, note: await createCreditNote(await request.json()) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "No se pudo emitir la nota de crédito." }, { status: 422 });
  }
}
