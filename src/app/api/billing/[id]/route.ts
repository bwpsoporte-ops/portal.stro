import { NextResponse } from "next/server";
import { updateBillingDocument } from "@/lib/server/billing";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: RouteContext<"/api/billing/[id]">) {
  try {
    const { id } = await context.params;
    const input = await request.json();
    return NextResponse.json({ ok: true, result: await updateBillingDocument(id, String(input.action), input) });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Error al actualizar." }, { status: 422 });
  }
}
