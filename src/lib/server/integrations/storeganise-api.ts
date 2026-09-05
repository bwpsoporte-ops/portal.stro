type JsonObject = Record<string, unknown>;

function configuredBaseUrl(payloadApiUrl?: unknown) {
  const configured = process.env.STOREGANISE_API_URL?.trim();
  const received = typeof payloadApiUrl === "string" ? payloadApiUrl.trim() : "";
  if (configured && received) {
    const configuredHost = new URL(configured).host.toLowerCase();
    const receivedHost = new URL(received).host.toLowerCase();
    if (configuredHost !== receivedHost) {
      throw new Error(
        `El webhook pertenece a ${receivedHost}, pero STOREGANISE_API_URL apunta a ${configuredHost}. Configura la URL y la clave API de la misma instancia.`,
      );
    }
  }
  const value = received || configured;
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
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `Storeganise API ${response.status}: STOREGANISE_API_KEY no está autorizada para ${new URL(url).host}. Verifica que la clave pertenezca a esta misma instancia y tenga permisos AdminAPI de lectura.`,
      );
    }
    throw new Error(`Storeganise API ${response.status}: ${detail}`);
  }
  const data = body.data;
  return data && typeof data === "object" && !Array.isArray(data)
    ? data as JsonObject
    : body;
}

export async function fetchStoreganiseUser(id: string, apiUrl?: unknown) {
  const path = `/v1/admin/users/${encodeURIComponent(id)}`;
  try {
    return await storeganiseAdminGet(`${path}?include=billing,customFields`, apiUrl);
  } catch (error) {
    if (error instanceof Error && error.message.includes("401")) throw error;
    return storeganiseAdminGet(path, apiUrl);
  }
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
