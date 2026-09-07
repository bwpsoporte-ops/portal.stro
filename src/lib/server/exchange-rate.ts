import { readSheet } from "read-excel-file/node";

const BCH_DAILY_RATE_URL =
  "https://www.bch.hn/estadisticos/GIE/LIBTipo%20de%20cambio/Precio%20Promedio%20Diario%20del%20D%C3%B3lar.xlsx";
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_RATE_AGE_DAYS = 7;

type DailySaleRate = { date: string; rate: number };
type RateCache = { rates: DailySaleRate[]; fetchedAt: number; checkedOn: string };

let cachedRates: RateCache | undefined;
let pendingFetch: Promise<RateCache> | undefined;

export type UsdToHnlRate = {
  rate: number;
  updatedAt: string | null;
  source: string;
  stale: boolean;
};

function hondurasDateKey(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Tegucigalpa",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function spreadsheetDateKey(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value !== "string") return null;
  const iso = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  const local = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const key = iso ? `${iso[1]}-${iso[2]}-${iso[3]}`
    : local ? `${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}` : null;
  if (!key) return null;
  const parsed = new Date(`${key}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === key ? key : null;
}

function parseDailySaleRates(rows: unknown[][]): DailySaleRate[] {
  const headerIndex = rows.findIndex((row) =>
    row.some((cell) => String(cell ?? "").trim().toLowerCase() === "fecha")
    && row.some((cell) => String(cell ?? "").trim().toLowerCase() === "venta"),
  );
  if (headerIndex < 0) throw new Error("El archivo del BCH no contiene las columnas Fecha y Venta.");
  const header = rows[headerIndex].map((cell) => String(cell ?? "").trim().toLowerCase());
  const dateColumn = header.indexOf("fecha");
  const saleColumn = header.indexOf("venta");
  return rows.slice(headerIndex + 1).flatMap((row) => {
    const date = spreadsheetDateKey(row[dateColumn]);
    const rate = Number(row[saleColumn]);
    return date && Number.isFinite(rate) && rate > 0 ? [{ date, rate: Number(rate.toFixed(4)) }] : [];
  });
}

function applicableRate(rates: DailySaleRate[], now: Date): DailySaleRate {
  const today = hondurasDateKey(now);
  // El BCH puede publicar mañana por adelantado y también incluye promedios mensuales.
  const current = rates.reduce<DailySaleRate | undefined>((latest, entry) =>
    entry.date <= today && (!latest || entry.date > latest.date) ? entry : latest,
  undefined);
  if (!current) throw new Error("El BCH no publicó una tasa de venta aplicable a la fecha actual.");
  const age = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${current.date}T00:00:00Z`)) / DAY_MS;
  if (age > MAX_RATE_AGE_DAYS) throw new Error("La última tasa de venta del BCH tiene más de 7 días de antigüedad.");
  return current;
}

async function fetchOfficialRates(): Promise<RateCache> {
  const response = await fetch(BCH_DAILY_RATE_URL, {
    headers: { accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`BCH respondió con estado ${response.status}.`);
  const rows = await readSheet(Buffer.from(await response.arrayBuffer()));
  const rates = parseDailySaleRates(rows);
  const now = new Date();
  applicableRate(rates, now);
  return { rates, fetchedAt: now.getTime(), checkedOn: hondurasDateKey(now) };
}

export async function getUsdToHnlRate(forceRefresh = false): Promise<UsdToHnlRate> {
  const now = new Date();
  let snapshot = cachedRates;
  let stale = false;
  if (forceRefresh || !snapshot || now.getTime() - snapshot.fetchedAt >= HOUR_MS || snapshot.checkedOn !== hondurasDateKey(now)) {
    try {
      pendingFetch ??= fetchOfficialRates().finally(() => { pendingFetch = undefined; });
      snapshot = await pendingFetch;
      cachedRates = snapshot;
    } catch (error) {
      // Solo reutilizar una consulta oficial reciente; nunca sustituir Venta por una tasa fija o promedio.
      if (!snapshot || now.getTime() - snapshot.fetchedAt > DAY_MS) {
        const detail = error instanceof Error ? ` ${error.message}` : "";
        throw new Error(`No se pudo obtener la tasa de venta USD/HNL del BCH. Intenta nuevamente.${detail}`);
      }
      stale = true;
    }
  }
  const current = applicableRate(snapshot.rates, new Date());
  return {
    rate: current.rate,
    updatedAt: `${current.date}T00:00:00-06:00`,
    source: stale ? "BCH · Tasa de venta (última consulta disponible)" : "BCH · Tasa de venta",
    stale,
  };
}
