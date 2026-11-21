import { NextResponse } from "next/server";
import { readStoreganiseCardPayments } from "@/lib/server/integrations/card-payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

// Read-only endpoint. Module-specific authentication was explicitly removed.
// The dashboard's client-side navigation guard is not server authentication:
// a direct request can read this response without a login.
export async function GET() {
  try {
    const result = await readStoreganiseCardPayments();
    return NextResponse.json(result, { headers });
  } catch {
    // Never serialize SQL errors or payment payloads to the browser/logs.
    return NextResponse.json(
      {
        ok: false,
        message:
          "No se pudieron consultar los pagos sincronizados. Verifica la conexión de la base de datos y vuelve a actualizar.",
      },
      { status: 503, headers },
    );
  }
}
