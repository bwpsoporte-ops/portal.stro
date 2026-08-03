import { createBillingPdf, getDocument } from "@/lib/server/billing";

export const runtime = "nodejs";

export async function GET(request: Request, context: RouteContext<"/api/billing/[id]/pdf">) {
  const { id } = await context.params;
  try {
    const document = await getDocument(id);
    const url = new URL(request.url);
    const currency = url.searchParams.get("currency") === "HNL" ? "HNL" : url.searchParams.get("currency") === "USD" ? "USD" : undefined;
    const language = url.searchParams.get("lang") === "en" ? "en" : url.searchParams.get("lang") === "es" ? "es" : undefined;
    const pdf = await createBillingPdf(id, { currency, language });
    const suffix = currency || language ? `-${currency ?? document.currency}-${language ?? "es"}` : "";
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
