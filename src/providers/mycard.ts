import { config } from '../config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { MyCardProvider, PaymentIntent, ProviderError } from './types';
// Replace request and signature contract with the official merchant documentation before production.
export class HttpMyCardProvider implements MyCardProvider {
  async createPayment(input: { orderId: string; amountTwd: number; productCode: string; uid: string; server: string }): Promise<PaymentIntent> {
    if (!config.MYCARD_CREATE_PAYMENT_URL || !config.MYCARD_MERCHANT_ID || !config.MYCARD_SECRET) throw new ProviderError('NOT_CONFIGURED', 'Authorized MyCard merchant integration is not configured');
    const response = await fetch(config.MYCARD_CREATE_PAYMENT_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ merchantId: config.MYCARD_MERCHANT_ID, orderId: input.orderId, amount: input.amountTwd, currency: 'TWD', region: 'TW', productCode: input.productCode, callbackUrl: config.MYCARD_CALLBACK_URL }), signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (!response?.ok) throw new ProviderError('UPSTREAM_UNAVAILABLE', 'MyCard payment service is unavailable');
    const data: any = await response.json().catch(() => null);
    if (typeof data?.paymentUrl !== 'string' || typeof data?.paymentId !== 'string') throw new ProviderError('UPSTREAM_UNAVAILABLE', 'Unexpected MyCard response; map it to the official contract');
    return { paymentUrl: data.paymentUrl, providerOrderId: data.paymentId };
  }
  verifyCallback(payload: Record<string, unknown>, signature?: string): boolean {
    if (!config.MYCARD_SECRET || !signature) return false;
    // Illustrative HMAC only; canonicalization and algorithm must match official MyCard docs.
    const expected = createHmac('sha256', config.MYCARD_SECRET).update(JSON.stringify(payload)).digest('hex');
    const a = Buffer.from(expected); const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
