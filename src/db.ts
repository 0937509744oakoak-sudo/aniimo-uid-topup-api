import { Pool } from 'pg';
import { config } from './config';
export const pool = new Pool({ connectionString: config.DATABASE_URL, ssl: config.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined, max: 15, idleTimeoutMillis: 30000 });
pool.on('error', (error) => console.error('Unexpected PostgreSQL pool error', error));
