import { NextResponse } from "next/server";
import { createBillingDocument, getBillingData, resetTestBilling } from "@/lib/server/billing";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const type = new URL(request.url).searchParams.get("type") ?? undefined;
    const includeCancelled = new URL(request.url).searchParams.get("includeCancelled") === "true";
    return NextResponse.json({ ok: true, ...(await getBillingData(type, includeCancelled)) });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Error al cargar." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    return NextResponse.json({ ok: true, document: await createBillingDocument(await request.json()) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Error al crear." }, { status: 422 });
  }
}

export async function DELETE(request: Request) {
  try {
    const input = await request.json();
    return NextResponse.json({
      ok: true,
      result: await resetTestBilling(String(input.confirmText ?? "")),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "No se pudieron reiniciar las pruebas." },
      { status: 422 },
    );
  }
}
