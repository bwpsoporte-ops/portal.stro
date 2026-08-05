import { NextResponse } from "next/server";
import { cancelCreditNote } from "@/lib/server/credit-notes";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const input = await request.json();
    if (input.action !== "CANCEL") throw new Error("Acción no permitida.");
    return NextResponse.json({ ok: true, note: await cancelCreditNote(id, String(input.reason ?? "")) });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "No se pudo anular la nota." }, { status: 422 });
  }
}
