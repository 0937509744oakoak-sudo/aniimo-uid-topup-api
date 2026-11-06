export interface Character { uid: string; server: string; characterName: string; level: number; }
export interface PaymentIntent { providerOrderId: string; paymentUrl: string; }
export type VerificationErrorCode = 'INVALID_UID' | 'INVALID_SERVER' | 'NOT_FOUND' | 'RATE_LIMITED' | 'CHALLENGE' | 'UPSTREAM_UNAVAILABLE' | 'NOT_CONFIGURED';
export class ProviderError extends Error { constructor(public readonly code: VerificationErrorCode, message: string, public readonly retryAfterSeconds?: number) { super(message); } }
export interface AniimoProvider { verify(uid: string, server: string): Promise<Character>; }
export interface MyCardProvider { createPayment(input: { orderId: string; amountTwd: number; productCode: string; uid: string; server: string }): Promise<PaymentIntent>; verifyCallback(payload: Record<string, unknown>, signature: string | undefined): boolean; }
