function assertRequired(names: readonly string[]) {
  if (process.env.NODE_ENV !== "production") return;
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Faltan variables de entorno: ${missing.join(", ")}`);
  }
}

export function assertStoreganiseConfig() {
  assertRequired([
    "DATABASE_URL",
    "STOREGANISE_WEBHOOK_SECRET",
    "STOREGANISE_API_URL",
    "STOREGANISE_API_KEY",
  ]);
}

export function assertPaymentConfig() {
  assertRequired(["DATABASE_URL", "PAY_PORTAL_WEBHOOK_SECRET"]);
}

export function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} no está configurada.`);
  return value;
}
