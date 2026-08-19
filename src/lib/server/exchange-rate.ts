type ExchangeApiResponse = {
  result?: string;
  rates?: Record<string, number>;
  time_last_update_utc?: string;
};

export type UsdToHnlRate = {
  rate: number;
  updatedAt: string | null;
  source: string;
};

export async function getUsdToHnlRate(): Promise<UsdToHnlRate> {
  const configured = Number(process.env.USD_TO_HNL_RATE);
  if (Number.isFinite(configured) && configured > 0) {
    return { rate: configured, updatedAt: null, source: "Configuración del portal" };
  }
  const response = await fetch("https://open.er-api.com/v6/latest/USD", {
    next: { revalidate: 21_600 },
    signal: AbortSignal.timeout(10_000),
  });
  const data = await response.json() as ExchangeApiResponse;
  const rate = data.rates?.HNL;
  if (!response.ok || data.result !== "success" || !Number.isFinite(rate) || Number(rate) <= 0) {
    throw new Error("No se pudo obtener una tasa USD/HNL válida para generar la factura automática.");
  }
  return { rate: Number(rate), updatedAt: data.time_last_update_utc ?? null, source: "ExchangeRate-API" };
}
