import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from './schema.js';

const databaseUrl = process.env.DATABASE_URL;

export const isNeonConfigured = Boolean(databaseUrl && databaseUrl.startsWith('postgres'));

let dbInstance: ReturnType<typeof drizzle> | null = null;
let poolInstance: Pool | null = null;

if (isNeonConfigured && databaseUrl) {
  try {
    poolInstance = new Pool({ connectionString: databaseUrl });
    dbInstance = drizzle(poolInstance, { schema });
  } catch (err) {
    console.error('[Neon] Failed to initialize Neon connection pool:', err);
  }
}

export const pool = poolInstance;
export const db = dbInstance;
export { schema };
