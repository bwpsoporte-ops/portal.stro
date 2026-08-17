import { NextResponse } from "next/server";
import { assertStoreganiseConfig } from "@/lib/server/integrations/config";
import { verifyStoreganiseSignedBody } from "@/lib/server/integrations/security";
import { processStoreganiseWebhook } from "@/lib/server/integrations/storeganise";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertStoreganiseConfig();
    const rawBody = await request.text();
    const signature = request.headers.get("sg-signature")
      ?? request.headers.get("x-storeganise-signature");
    if (!verifyStoreganiseSignedBody(rawBody, signature, process.env.STOREGANISE_WEBHOOK_SECRET)) {
      return NextResponse.json({ ok: false, error: "Firma Storeganise inválida." }, { status: 401 });
    }
    const payload = JSON.parse(rawBody || "{}") as Record<string, unknown>;
    const result = await processStoreganiseWebhook(payload, rawBody);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Storeganise webhook:", error);
    const message = error instanceof SyntaxError ? "El cuerpo no contiene JSON válido." : "No se pudo procesar el evento.";
    return NextResponse.json({ ok: false, error: message }, { status: error instanceof SyntaxError ? 400 : 500 });
  }
}
