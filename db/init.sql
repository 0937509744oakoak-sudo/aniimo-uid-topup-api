CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), public_id TEXT NOT NULL UNIQUE, provider_order_id TEXT UNIQUE,
  uid TEXT NOT NULL, server TEXT NOT NULL, character_name TEXT, character_level INTEGER,
  product_code TEXT NOT NULL, amount_twd INTEGER NOT NULL CHECK (amount_twd > 0),
  currency CHAR(3) NOT NULL DEFAULT 'TWD' CHECK (currency = 'TWD'), region CHAR(2) NOT NULL DEFAULT 'TW' CHECK (region = 'TW'),
  status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment','paid','topup_pending','completed','payment_failed','topup_failed','cancelled','expired')),
  payment_url TEXT, payment_reference TEXT, idempotency_key TEXT UNIQUE, failure_code TEXT, failure_message TEXT,
  provider_metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), paid_at TIMESTAMPTZ, completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS orders_uid_created_idx ON orders(uid, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_created_idx ON orders(status, created_at);
CREATE TABLE IF NOT EXISTS topup_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  attempt_no INTEGER NOT NULL CHECK (attempt_no > 0), status TEXT NOT NULL CHECK (status IN ('started','succeeded','failed','unknown')),
  provider_reference TEXT, request_metadata JSONB NOT NULL DEFAULT '{}'::jsonb, response_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_code TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(order_id, attempt_no)
);
CREATE TABLE IF NOT EXISTS payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_id UUID REFERENCES orders(id) ON DELETE RESTRICT,
  provider_event_id TEXT UNIQUE, event_type TEXT NOT NULL, verified BOOLEAN NOT NULL DEFAULT false,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
