import { NextResponse } from "next/server";
import { readStoreganiseCardPayments } from "@/lib/server/integrations/card-payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const { payments, invoiceLimitReached } = await readStoreganiseCardPayments();
    const received = payments.filter(({ status }) => status === "APPROVED" || status === "RECORDED");
    return NextResponse.json({
      received: received.length,
      approved: received.filter(({ status }) => status === "APPROVED").length,
      invoiceLimitReached,
      latest: received.slice(0, 5).map(({ key, customerName, amount, currency, status, manual, reference, paymentId, paidAt }) =>
        ({ key, customerName, amount, currency, status, manual, reference, paymentId, paidAt })),
    }, { headers });
  } catch {
    return NextResponse.json({ message: "No se pudieron consultar los pagos con tarjeta." }, { status: 503, headers });
  }
}
