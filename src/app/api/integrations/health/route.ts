import { NextResponse } from "next/server";
import { getPool } from "@/lib/server/db";
import { ensureIntegrationSchema } from "@/lib/server/integrations/schema";
import { isSmtpConfigured } from "@/lib/server/smtp";

export const runtime = "nodejs";

export async function GET() {
  try {
    await ensureIntegrationSchema();
    await getPool().query("SELECT 1");
    return NextResponse.json({
      ok: true,
      service: "portal-integrations",
      database: "connected",
      storeganise: {
        configured: Boolean(
          process.env.STOREGANISE_WEBHOOK_SECRET
          && process.env.STOREGANISE_API_URL
          && process.env.STOREGANISE_API_KEY
        ),
      },
      payments: { configured: Boolean(process.env.PAY_PORTAL_WEBHOOK_SECRET) },
      smtp: {
        configured: isSmtpConfigured(),
      },
    });
  } catch {
    return NextResponse.json({ ok: false, service: "portal-integrations", database: "error" }, { status: 503 });
  }
}
