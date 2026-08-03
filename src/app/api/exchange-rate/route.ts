import { NextResponse } from "next/server";

type ExchangeApiResponse = {
  result?: string;
  rates?: Record<string, number>;
  time_last_update_utc?: string;
};

export async function GET() {
  try {
    const response = await fetch("https://open.er-api.com/v6/latest/USD", {
      next: { revalidate: 21_600 },
    });
    const data = await response.json() as ExchangeApiResponse;
    const rate = data.rates?.HNL;

    if (!response.ok || data.result !== "success" || !Number.isFinite(rate)) {
      throw new Error("La fuente de tipo de cambio no devolvió una tasa válida.");
    }

    return NextResponse.json({
      base: "USD",
      quote: "HNL",
      rate,
      updatedAt: data.time_last_update_utc ?? null,
      source: "ExchangeRate-API",
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
