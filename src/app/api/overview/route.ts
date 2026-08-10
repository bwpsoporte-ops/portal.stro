import { NextResponse } from "next/server";
import { getPool } from "@/lib/server/db";
import { ensureIntegrationSchema } from "@/lib/server/integrations/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureIntegrationSchema();
    const db = getPool();
    const [metricsResult, fiscalResult, invoicesResult] = await Promise.all([
      db.query<{
        billed_today: string;
        billed_month: string;
        generated_invoices: number;
        sent_invoices: number;
      }>(
        `SELECT
           COALESCE(SUM(CASE
             WHEN (created_at AT TIME ZONE 'America/Tegucigalpa')::date =
                  (now() AT TIME ZONE 'America/Tegucigalpa')::date
             THEN CASE WHEN currency='HNL' AND COALESCE(exchange_rate,0)>0
                       THEN total/exchange_rate ELSE total END ELSE 0 END),0)::text AS billed_today,
           COALESCE(SUM(CASE
             WHEN date_trunc('month',created_at AT TIME ZONE 'America/Tegucigalpa') =
                  date_trunc('month',now() AT TIME ZONE 'America/Tegucigalpa')
             THEN CASE WHEN currency='HNL' AND COALESCE(exchange_rate,0)>0
                       THEN total/exchange_rate ELSE total END ELSE 0 END),0)::text AS billed_month,
           COUNT(*)::integer AS generated_invoices,
           COUNT(*) FILTER (WHERE sent_at IS NOT NULL)::integer AS sent_invoices
         FROM billing_documents
         WHERE document_type='INVOICE' AND status<>'CANCELLED'`,
      ),
      db.query<{
        cai: string;
        range_start: number;
        range_end: number;
        current_number: number;
        expiration_date: string;
        establishment: string;
        emission_point: string;
        document_type: string;
        available: number;
      }>(
        `SELECT cai,range_start,range_end,current_number,
                expiration_date::text AS expiration_date,
                establishment,emission_point,document_type,
                GREATEST(range_end-current_number+1,0)::integer AS available
         FROM cai_ranges
         WHERE status::text='ACTIVE' AND document_type='01'
           AND expiration_date>=current_date AND current_number<=range_end
         ORDER BY created_at DESC LIMIT 1`,
      ),
      db.query(
        `SELECT id,document_number,customer_name,total,currency,status,sent_at,created_at,source
         FROM billing_documents
         WHERE document_type='INVOICE' AND status<>'CANCELLED'
         ORDER BY created_at DESC LIMIT 5`,
      ),
    ]);

    return NextResponse.json({
      ok: true,
      metrics: metricsResult.rows[0],
      fiscal: fiscalResult.rows[0] ?? null,
      invoices: invoicesResult.rows,
    }, { headers: { "cache-control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      message: error instanceof Error ? error.message : "No se pudo cargar Overview.",
    }, { status: 500 });
  }
}
