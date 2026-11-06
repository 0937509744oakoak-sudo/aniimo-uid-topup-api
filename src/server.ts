import { app } from './app';
import { config } from './config';
import { pool } from './db';
const server = app.listen(config.PORT, () => console.log(`Aniimo UID Top-Up API listening on ${config.PORT}`));
async function shutdown() { server.close(async () => { await pool.end(); process.exit(0); }); setTimeout(() => process.exit(1), 10000).unref(); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
