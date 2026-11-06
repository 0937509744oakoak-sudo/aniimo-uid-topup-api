import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { pool } from './db';
import { config } from './config';
import { HttpAniimoProvider } from './providers/aniimo';
import { HttpMyCardProvider } from './providers/mycard';
import { ProviderError } from './providers/types';
export const app = express();
app.disable('x-powered-by'); app.use(helmet()); app.use(cors({ origin: false })); app.use(express.json({ limit: '32kb' }));
const aniimo = new HttpAniimoProvider(); const mycard = new HttpMyCardProvider();
const verifyBody = z.object({ uid: z.string().trim().min(3).max(64).regex(/^[\w-]+$/), server: z.string().trim().min(1).max(32).regex(/^[\w -]+$/) });
const orderBody = verifyBody.extend({ productCode: z.string().trim().min(1).max(64), amountTwd: z.number().int().min(config.ORDER_TWD_MIN).max(config.ORDER_TWD_MAX) });
function validationError(error: z.ZodError) { return { error: { code: 'VALIDATION_ERROR', message: 'Request fields are invalid', details: error.flatten().fieldErrors } }; }
app.get('/health', async (_req, res) => { try { await pool.query('SELECT 1'); res.json({ status: 'ok' }); } catch { res.status(503).json({ status: 'unavailable' }); } });
app.post('/api/v1/aniimo/verify', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = verifyBody.safeParse(req.body); if (!parsed.success) return res.status(400).json(validationError(parsed.error));
  try { res.json({ data: await aniimo.verify(parsed.data.uid, parsed.data.server) }); } catch (e) { next(e); }
});
app.post('/api/v1/orders', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = orderBody.safeParse(req.body); if (!parsed.success) return res.status(400).json(validationError(parsed.error));
  const idempotencyKey = req.header('Idempotency-Key')?.slice(0, 128);
  try {
    const character = await aniimo.verify(parsed.data.uid, parsed.data.server); const publicId = randomUUID();
    const inserted = await pool.query(`INSERT INTO orders(public_id,uid,server,character_name,character_level,product_code,amount_twd,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(idempotency_key) DO NOTHING RETURNING *`, [publicId, character.uid, character.server, character.characterName, character.level, parsed.data.productCode, parsed.data.amountTwd, idempotencyKey || null]);
    let order = inserted.rows[0]; if (!order && idempotencyKey) order = (await pool.query('SELECT * FROM orders WHERE idempotency_key=$1', [idempotencyKey])).rows[0];
    if (!order) throw new Error('Could not create order');
    if (order.payment_url) return res.status(200).json({ data: { orderId: order.public_id, status: order.status, paymentUrl: order.payment_url } });
    const payment = await mycard.createPayment({ orderId: order.public_id, amountTwd: order.amount_twd, productCode: order.product_code, uid: order.uid, server: order.server });
    await pool.query('UPDATE orders SET provider_order_id=$1,payment_url=$2,updated_at=now() WHERE id=$3', [payment.providerOrderId, payment.paymentUrl, order.id]);
    return res.status(201).json({ data: { orderId: order.public_id, status: 'pending_payment', paymentUrl: payment.paymentUrl, amountTwd: order.amount_twd, currency: 'TWD', region: 'TW' } });
  } catch (e) { next(e); }
});
app.post('/api/v1/payments/mycard/callback', async (req, res, next) => {
  try {
    const payload = req.body as Record<string, unknown>; const signature = req.header('x-mycard-signature') || undefined;
    if (!mycard.verifyCallback(payload, signature)) return res.status(401).json({ error: { code: 'INVALID_SIGNATURE', message: 'Payment callback signature is invalid' } });
    const orderId = String(payload.orderId || ''); const status = String(payload.status || '').toLowerCase(); const eventId = String(payload.eventId || payload.paymentId || randomUUID());
    const client = await pool.connect();
    try {
      await client.query('BEGIN'); const found = await client.query('SELECT * FROM orders WHERE public_id=$1 FOR UPDATE', [orderId]);
      if (!found.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: { code: 'ORDER_NOT_FOUND' } }); }
      const order = found.rows[0];
      await client.query('INSERT INTO payment_events(order_id,provider_event_id,event_type,verified,payload) VALUES($1,$2,$3,true,$4) ON CONFLICT(provider_event_id) DO NOTHING', [order.id, eventId, status || 'unknown', payload]);
      if (status === 'paid' && ['pending_payment','payment_failed'].includes(order.status)) await client.query("UPDATE orders SET status='paid',payment_reference=$1,paid_at=now(),updated_at=now() WHERE id=$2", [String(payload.paymentId || ''), order.id]);
      else if (status === 'failed' && order.status === 'pending_payment') await client.query("UPDATE orders SET status='payment_failed',updated_at=now() WHERE id=$1", [order.id]);
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    res.json({ received: true });
  } catch (e) { next(e); }
});
app.get('/api/v1/orders/:orderId', async (req, res, next) => { try { const result = await pool.query('SELECT public_id,status,uid,server,character_name,character_level,product_code,amount_twd,currency,region,created_at,paid_at,completed_at FROM orders WHERE public_id=$1', [req.params.orderId]); if (!result.rowCount) return res.status(404).json({ error: { code: 'ORDER_NOT_FOUND' } }); res.json({ data: result.rows[0] }); } catch (e) { next(e); } });
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ProviderError) { const status = err.code === 'NOT_CONFIGURED' ? 503 : err.code === 'NOT_FOUND' || err.code === 'INVALID_UID' || err.code === 'INVALID_SERVER' ? 422 : err.code === 'RATE_LIMITED' ? 429 : 502; if (err.retryAfterSeconds) res.setHeader('Retry-After', String(err.retryAfterSeconds)); return res.status(status).json({ error: { code: err.code, message: err.message } }); }
  console.error('Unhandled request error', err); res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error' } });
});
