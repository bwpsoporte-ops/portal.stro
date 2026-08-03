import { NextResponse } from "next/server";
import { getPool } from "@/lib/server/db";
import { ensureIntegrationSchema } from "@/lib/server/integrations/schema";

export const runtime = "nodejs";

export async function GET() {
  try {
    await ensureIntegrationSchema();
    const result = await getPool().query(
      `SELECT o.id,o.unit_code,o.customer_id,o.customer_key,o.customer_name,o.customer_email,
              o.customer_phone,o.customer_rtn,o.occupied_at,o.next_due_date::text AS next_due_date,
              (o.next_due_date-current_date)::integer AS days_remaining,o.last_invoice_id,
              CASE WHEN o.next_due_date < current_date THEN 'OVERDUE'
                   WHEN o.next_due_date <= current_date+3 THEN 'DUE_SOON'
                   ELSE 'UPCOMING' END AS alert_status,
              ARRAY(SELECT other.unit_code FROM storage_occupancies other
                    WHERE other.customer_key=o.customer_key AND other.status='ACTIVE'
                    ORDER BY other.unit_code) AS customer_units,
              d.document_number,d.currency,d.total,d.amount_paid,d.status AS invoice_status
       FROM storage_occupancies o
       LEFT JOIN billing_documents d ON d.id=o.last_invoice_id
       WHERE o.status='ACTIVE'
       ORDER BY o.next_due_date,o.unit_code`,
    );
    return NextResponse.json({ ok: true, alerts: result.rows });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "No se pudieron cargar las alertas." }, { status: 500 });
  }
}
