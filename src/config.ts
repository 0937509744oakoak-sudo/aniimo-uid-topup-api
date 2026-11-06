import 'dotenv/config';
import { z } from 'zod';
const schema = z.object({
  NODE_ENV: z.string().default('development'), PORT: z.coerce.number().int().positive().default(3000), DATABASE_URL: z.string().min(1), DATABASE_SSL: z.string().default('false'),
  ANIIMO_VERIFY_URL: z.string().optional().default(''), ANIIMO_API_TOKEN: z.string().optional().default(''), ANIIMO_API_KEY: z.string().optional().default(''),
  MYCARD_CREATE_PAYMENT_URL: z.string().optional().default(''), MYCARD_MERCHANT_ID: z.string().optional().default(''), MYCARD_SECRET: z.string().optional().default(''),
  MYCARD_CALLBACK_URL: z.string().url().default('http://localhost:3000/api/v1/payments/mycard/callback'), PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
  ORDER_TWD_MIN: z.coerce.number().int().positive().default(1), ORDER_TWD_MAX: z.coerce.number().int().positive().default(100000)
});
export const config = schema.parse(process.env);
