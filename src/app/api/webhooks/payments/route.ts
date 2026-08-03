import { NextResponse } from "next/server";
import { assertIntegrationConfig } from "@/lib/server/integrations/config";
import { verifySignedBody, verifyTimestamp } from "@/lib/server/integrations/security";
import { processPaymentNotice, validatePaymentNotice } from "@/lib/server/integrations/payment";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertIntegrationConfig();
    const rawBody = await request.text();
    const signature = request.headers.get("x-portal-signature");
    const timestamp = request.headers.get("x-portal-timestamp");
    if (!verifyTimestamp(timestamp) ||
        !verifySignedBody(rawBody, signature, process.env.PAY_PORTAL_WEBHOOK_SECRET)) {
      return NextResponse.json({ ok: false, error: "Firma o fecha inválida." }, { status: 401 });
    }
    const payload = JSON.parse(rawBody || "{}");
    const notice = validatePaymentNotice(payload);
    const result = await processPaymentNotice(notice, payload);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Payment webhook:", error);
    const message = error instanceof Error ? error.message : "No se pudo procesar el pago.";
    const clientError = error instanceof SyntaxError || /inválid|Faltan|no existe|no coincide/i.test(message);
    return NextResponse.json({ ok: false, error: message }, { status: clientError ? 400 : 500 });
  }
}
