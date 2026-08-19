import { NextResponse } from "next/server";
import { getUsdToHnlRate } from "@/lib/server/exchange-rate";

export async function GET() {
  try {
    const result = await getUsdToHnlRate();
    return NextResponse.json({
      base: "USD",
      quote: "HNL",
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error
          ? error.message
          : "No se pudo consultar el tipo de cambio.",
      },
      { status: 502 },
    );
  }
}
