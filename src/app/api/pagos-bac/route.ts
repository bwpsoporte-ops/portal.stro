import { NextResponse } from "next/server";
import { authorizeCardPayments, CardPaymentsAccessError, hasCardPaymentsAccess, readStoreganiseCardPayments } from "@/lib/server/integrations/card-payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Authorization", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request) {
  try {
    if (!(await hasCardPaymentsAccess(request.headers.get("authorization")))) {
      return NextResponse.json({ ok: false, code: "AUTH_REQUIRED", message: "Valida tus credenciales dentro de Pagos BAC para consultar las transacciones." }, { status: 401, headers });
    }
    return NextResponse.json(await readStoreganiseCardPayments(), { headers });
  } catch {
    // Never serialize SQL errors or payment payloads to the browser/logs.
    return NextResponse.json({ ok: false, message: "No se pudieron consultar los pagos sincronizados. Verifica la conexión de la base de datos y vuelve a actualizar." }, { status: 503, headers });
  }
}

// This is module-only authentication, NOT a payment or Storeganise webhook.
// It does not change the portal login, cookies, users or billing records.
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin
    || request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    return NextResponse.json({ ok: false, message: "Solicitud no permitida." }, { status: 403, headers });
  }
  try {
    // Bound the body even when Content-Length is absent or forged.
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ ok: false, message: "Ingresa usuario y contraseña." }, { status: 400, headers });
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4096) {
          await reader.cancel();
          return NextResponse.json({ ok: false, message: "Solicitud demasiado grande." }, { status: 413, headers });
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!input || typeof input.username !== "string" || !input.username.trim() || input.username.length > 254
      || typeof input.password !== "string" || !input.password || Buffer.byteLength(input.password) > 72) {
      return NextResponse.json({ ok: false, message: "Ingresa un usuario y una contraseña válidos." }, { status: 400, headers });
    }
    const access = await authorizeCardPayments(input.username, input.password);
    if (!access) {
      return NextResponse.json({ ok: false, message: "Usuario o contraseña incorrectos, o cuenta no activa." }, { status: 401, headers });
    }
    return NextResponse.json({ ok: true, access }, { headers });
  } catch (error) {
    if (error instanceof CardPaymentsAccessError) {
      if (error.code === "RATE_LIMIT") {
        return NextResponse.json({ ok: false, message: "Demasiados intentos. Espera cinco minutos antes de volver a validar." }, { status: 429, headers: { ...headers, "Retry-After": "300" } });
      }
      return NextResponse.json({ ok: false, message: "Falta configurar PAGOS_BAC_SESSION_SECRET o ROOT_PASSWORD (privada) en el servidor." }, { status: 503, headers });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ ok: false, message: "Solicitud inválida." }, { status: 400, headers });
    }
    return NextResponse.json({ ok: false, message: "No se pudo validar el acceso. Intenta nuevamente." }, { status: 503, headers });
  }
}
