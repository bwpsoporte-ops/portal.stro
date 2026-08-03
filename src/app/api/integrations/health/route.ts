import { NextResponse } from "next/server";
import { getPool } from "@/lib/server/db";
import { ensureIntegrationSchema } from "@/lib/server/integrations/schema";

export const runtime = "nodejs";

export async function GET() {
  try {
    await ensureIntegrationSchema();
    await getPool().query("SELECT 1");
    return NextResponse.json({ ok: true, service: "portal-integrations", database: "connected" });
  } catch {
    return NextResponse.json({ ok: false, service: "portal-integrations", database: "error" }, { status: 503 });
  }
}
