import { NextResponse } from "next/server";
import { readStoreganiseCardPayments } from "@/lib/server/integrations/card-payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

async function loadSummary() {
  const { payments, lastSync } = await readStoreganiseCardPayments("overview-history");
  const received = payments.reduce((count, { status }) =>
    count + Number(status === "APPROVED" || status === "RECORDED"), 0);
  return { received, lastSync };
}

// Overview only needs the count and sync date, not individual payment details.
let cached: { value: Awaited<ReturnType<typeof loadSummary>>; expiresAt: number } | undefined;
let inFlight: ReturnType<typeof loadSummary> | undefined;
function summary() {
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value);
  inFlight ??= loadSummary().then((value) => {
    cached = { value, expiresAt: Date.now() + 15_000 };
    return value;
  }).finally(() => { inFlight = undefined; });
  return inFlight;
}

export async function GET() {
  try {
    return NextResponse.json(await summary(), { headers });
  } catch {
    return NextResponse.json({ message: "No se pudieron consultar los pagos con tarjeta." }, { status: 503, headers });
  }
}
