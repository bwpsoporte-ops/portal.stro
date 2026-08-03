import { NextResponse } from "next/server";
import { createServiceCharge, getServiceModuleData, registerServicePayment } from "@/lib/server/services/service-charges";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...(await getServiceModuleData()) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo cargar el módulo.";
    return NextResponse.json({ ok: false, message, customers: [], services: [], charges: [] }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const input = await request.json();
    return NextResponse.json({ ok: true, charge: await createServiceCharge(input) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo generar el cobro.";
    return NextResponse.json({ ok: false, message }, { status: error instanceof SyntaxError ? 400 : 422 });
  }
}

export async function PATCH(request: Request) {
  try {
    const input = await request.json();
    return NextResponse.json({ ok: true, payment: await registerServicePayment(input) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo registrar el pago.";
    return NextResponse.json({ ok: false, message }, { status: error instanceof SyntaxError ? 400 : 422 });
  }
}
