import { Pool, QueryResultRow } from "pg";

type QueryValue = string | number | boolean | null | Date;

let pool: Pool | null = null;
let schemaReady = false;

function getPool() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL no está configurada.");
  }

  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes("sslmode=require") || connectionString.includes("neon.tech")
        ? { rejectUnauthorized: false }
        : undefined,
    });
  }

  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, values: QueryValue[] = []) {
  await ensureAppUsersSchema();
  return getPool().query<T>(text, values);
}

export async function ensureAppUsersSchema() {
  if (schemaReady) {
    return;
  }

  const db = getPool();

  await db.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  await db.query("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS invited_by_id text");
  await db.query("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS invited_by_name text");
  await db.query("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS invited_by_email text");

  schemaReady = true;
}
