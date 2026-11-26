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
        billed_today_hnl: string;
        billed_today_usd: string;
        billed_month_hnl: string;
        billed_month_usd: string;
        generated_invoices: number;
        sent_invoices: number;
      }>(
        `WITH limits AS (
           SELECT
             date_trunc('day', now() AT TIME ZONE 'America/Tegucigalpa') AS today_start,
             date_trunc('month', now() AT TIME ZONE 'America/Tegucigalpa') AS month_start
         ), normalized AS (
           SELECT
             created_at AT TIME ZONE 'America/Tegucigalpa' AS local_created_at,
             sent_at,
             CASE
               WHEN UPPER(TRIM(currency))='HNL' THEN COALESCE(total,0)
               ELSE COALESCE(NULLIF(equivalent_total,0),COALESCE(total,0)*NULLIF(exchange_rate,0),0)
             END AS total_hnl,
             CASE
               WHEN UPPER(TRIM(currency))='USD' THEN COALESCE(total,0)
               ELSE COALESCE(COALESCE(total,0)/NULLIF(exchange_rate,0),0)
             END AS total_usd
           FROM billing_documents
           WHERE UPPER(TRIM(document_type))='INVOICE'
             AND UPPER(TRIM(status))<>'CANCELLED'
         )
         SELECT
           COALESCE(SUM(total_hnl) FILTER (
             WHERE local_created_at>=limits.today_start
               AND local_created_at<limits.today_start+INTERVAL '1 day'
           ),0)::text AS billed_today_hnl,
           COALESCE(SUM(total_usd) FILTER (
             WHERE local_created_at>=limits.today_start
               AND local_created_at<limits.today_start+INTERVAL '1 day'
           ),0)::text AS billed_today_usd,
           COALESCE(SUM(total_hnl) FILTER (
             WHERE local_created_at>=limits.month_start
               AND local_created_at<limits.month_start+INTERVAL '1 month'
           ),0)::text AS billed_month_hnl,
           COALESCE(SUM(total_usd) FILTER (
             WHERE local_created_at>=limits.month_start
               AND local_created_at<limits.month_start+INTERVAL '1 month'
           ),0)::text AS billed_month_usd,
           COUNT(*)::integer AS generated_invoices,
           COUNT(*) FILTER (WHERE sent_at IS NOT NULL)::integer AS sent_invoices
         FROM normalized CROSS JOIN limits`,
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
        `SELECT id,document_number,customer_name,total,currency,status,sent_at,created_at,source,
                CASE WHEN UPPER(TRIM(currency))='HNL' THEN COALESCE(total,0) ELSE COALESCE(NULLIF(equivalent_total,0),COALESCE(total,0)*NULLIF(exchange_rate,0),0) END AS total_hnl,
                CASE WHEN UPPER(TRIM(currency))='USD' THEN COALESCE(total,0) ELSE COALESCE(COALESCE(total,0)/NULLIF(exchange_rate,0),0) END AS total_usd
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
