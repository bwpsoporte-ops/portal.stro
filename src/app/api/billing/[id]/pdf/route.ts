import { createBillingPdf, getDocument } from "@/lib/server/billing";

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext<"/api/billing/[id]/pdf">) {
  const { id } = await context.params;
  try {
    const document = await getDocument(id);
    const pdf = await createBillingPdf(id, { currency: "HNL", language: "es" });
    const suffix = "-HNL-es";
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="${document.document_number}${suffix}.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "PDF no disponible." }, { status: 404 });
  }
}
