import { NextResponse } from "next/server";
import { hasRootAuthorization } from "@/lib/server/root-session";
import { readStoreganiseCardPayments } from "@/lib/server/integrations/card-payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET() {
  try {
    if (!(await hasRootAuthorization())) {
      return NextResponse.json({ ok: false, message: "Inicia sesión nuevamente con el usuario root para consultar las transacciones. El acceso de invitados requiere autorización de servidor, todavía no disponible." }, { status: 403, headers });
    }
    return NextResponse.json(await readStoreganiseCardPayments(), { headers });
  } catch {
    // Never serialize SQL errors or payment payloads to the browser/logs.
    return NextResponse.json({ ok: false, message: "No se pudieron consultar los pagos sincronizados. Verifica la conexión de la base de datos y vuelve a actualizar." }, { status: 503, headers });
  }
}
