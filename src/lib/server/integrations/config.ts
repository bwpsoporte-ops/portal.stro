const requiredInProduction = [
  "DATABASE_URL",
  "STOREGANISE_WEBHOOK_SECRET",
  "PAY_PORTAL_WEBHOOK_SECRET",
] as const;

export function assertIntegrationConfig() {
  if (process.env.NODE_ENV !== "production") return;

  const missing = requiredInProduction.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Faltan variables de entorno: ${missing.join(", ")}`);
  }
}

export function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} no está configurada.`);
  return value;
}
