type JsonObject = Record<string, unknown>;

function configuredBaseUrl(payloadApiUrl?: unknown) {
  const value = typeof payloadApiUrl === "string" && payloadApiUrl.trim()
    ? payloadApiUrl
    : process.env.STOREGANISE_API_URL;
  if (!value) throw new Error("STOREGANISE_API_URL no está configurada.");
  return value.replace(/\/+$/, "");
}

function apiPath(baseUrl: string, path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return baseUrl.endsWith("/api") && normalizedPath.startsWith("/api/")
    ? `${baseUrl}${normalizedPath.slice(4)}`
    : `${baseUrl}${normalizedPath}`;
}

export async function storeganiseAdminGet(
  path: string,
  payloadApiUrl?: unknown,
): Promise<JsonObject> {
  const apiKey = process.env.STOREGANISE_API_KEY;
  if (!apiKey) throw new Error("STOREGANISE_API_KEY no está configurada.");

  const url = apiPath(configuredBaseUrl(payloadApiUrl), path);
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      authorization: `ApiKey ${apiKey}`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json().catch(() => ({})) as JsonObject;
  if (!response.ok) {
    const error = body.error && typeof body.error === "object"
      ? body.error as JsonObject
      : body;
    const detail = String(error.message ?? error.type ?? response.statusText);
    throw new Error(`Storeganise API ${response.status}: ${detail}`);
  }
  const data = body.data;
  return data && typeof data === "object" && !Array.isArray(data)
    ? data as JsonObject
    : body;
}

export function fetchStoreganiseUser(id: string, apiUrl?: unknown) {
  return storeganiseAdminGet(`/v1/admin/users/${encodeURIComponent(id)}`, apiUrl);
}

export function fetchStoreganiseInvoice(id: string, apiUrl?: unknown) {
  return storeganiseAdminGet(`/v1/admin/invoices/${encodeURIComponent(id)}`, apiUrl);
}

export function fetchStoreganiseJob(id: string, apiUrl?: unknown) {
  return storeganiseAdminGet(`/v1/admin/jobs/${encodeURIComponent(id)}`, apiUrl);
}

export function fetchStoreganiseUnit(id: string, apiUrl?: unknown) {
  return storeganiseAdminGet(`/v1/admin/units/${encodeURIComponent(id)}`, apiUrl);
}

export function fetchStoreganiseUnitRental(id: string, apiUrl?: unknown) {
  return storeganiseAdminGet(`/v1/admin/unit-rentals/${encodeURIComponent(id)}`, apiUrl);
}
