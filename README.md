# Aniimo UID Top-Up API

ตัวอย่าง backend ด้วย Node.js, TypeScript, Express และ PostgreSQL สำหรับ Region Taiwan และสกุลเงิน TWD โครงการนี้เชื่อมต่อได้กับ **API/merchant contract ที่ได้รับอนุญาต** เท่านั้น ไม่มีการเดา endpoint ภายใน ขโมย session/cookie หลบ CAPTCHA หรืออ้างว่า signature ที่ไม่มีเอกสารจะใช้ได้จริง

## เริ่มระบบ

1. คัดลอก `.env.example` เป็น `.env` และตั้ง `POSTGRES_PASSWORD` เป็นรหัสผ่านเฉพาะ
2. กำหนด endpoint และ credentials ที่ผู้ให้บริการออกให้ตามหัวข้อด้านล่าง
3. รัน `docker compose up --build`
4. API อยู่ที่ `http://localhost:3000`; health check ที่ `/health`

Schema ใน `db/init.sql` ทำงานตอนสร้าง PostgreSQL volume ครั้งแรก; production ควรจัดการ schema ด้วย migration

## โครงสร้างโปรเจกต์

```text
src/
  app.ts                  routes, validation, order/callback flow
  config.ts               environment validation
  db.ts                   PostgreSQL pool
  providers/aniimo.ts     Aniimo verification adapter
  providers/mycard.ts     MyCard payment adapter
  server.ts               startup and graceful shutdown
db/init.sql               orders, topup_attempts, payment_events
Dockerfile
docker-compose.yml
examples.http
```

## Reverse engineering และการเชื่อมต่อ

วิเคราะห์ protocol เฉพาะ staging/test account และเมื่อได้รับอนุญาตจาก Aniimo/MyCard เก็บ request/response ที่ลบ PII และ secret แล้วระบุ contract version, region, เวลา และผลทดสอบ ห้าม replay traffic ผู้ใช้จริงหรือส่ง password ลูกค้าผ่าน backend นี้

- **Endpoints:** ยืนยัน host, path, method, API version, region, sandbox/production และ rate limits จากเอกสารทางการ ห้ามเดา path แล้วเรียก production โดยพลการ
- **Headers:** บันทึกชนิด content, locale/region, request ID และชื่อ header auth ตามเอกสาร อย่าบันทึก Authorization, token หรือ signature ลง log
- **Cookies:** หาก API ทางการกำหนด cookie ให้จำกัดโดเมน อายุ และสิทธิ์; เก็บใน secret manager ห้ามนำ session cookie จาก browser มาเลี่ยง authentication
- **Payload:** ยืนยันชื่อ/ชนิดฟิลด์, encoding, รูปแบบ UID/server, product code, TWD, amount, timestamp, idempotency และ error response ด้วย sandbox
- **Signature/token:** ใช้ canonicalization, encoding, hash/HMAC หรือ key ตามเอกสารฉบับปัจจุบัน ป้องกัน replay ด้วย timestamp/nonce และตรวจ callback แบบ constant-time; ตัวอย่าง HMAC ในโค้ดไม่ใช่ข้อกำหนด MyCard
- **ผล verify:** map เฉพาะ response ที่ยืนยัน UID/server จริง ห้ามรับชื่อตัวละครหรือเลเวลจาก client

`ANIIMO_VERIFY_URL` adapter ส่ง JSON `{ uid, server }` และคาด response `{ characterName, level }` หรือ `{ character: { name, level } }`; แก้ mapping ใน `src/providers/aniimo.ts` ให้ตรง contract ก่อนใช้จริง แปล HTTP 404/422 เป็น UID/server ไม่พบ, 429 เป็น rate limit, 401/403 เป็น authorization/challenge

`MYCARD_CREATE_PAYMENT_URL` เป็น adapter ตัวอย่างที่รับ `merchantId`, `orderId`, `amount`, `currency`, `region`, `productCode`, `callbackUrl` และคาด `{ paymentId, paymentUrl }`; ปรับ request, signature และ callback ตามเอกสาร merchant จริง ก่อน production callback ต้องตรวจ signature, merchant, order, amount, currency, region และ event uniqueness ให้ครบ อย่าถือ browser redirect ว่าชำระแล้ว

## API

### `POST /api/v1/aniimo/verify`

รับ `{ "uid": "...", "server": "..." }`; คืนข้อมูลตัวละครที่ provider ยืนยัน หรือ error เช่น `NOT_FOUND`, `RATE_LIMITED`, `CHALLENGE`, `UPSTREAM_UNAVAILABLE`, `NOT_CONFIGURED`

### `POST /api/v1/orders`

รับ `{ "uid", "server", "productCode", "amountTwd" }`; ตรวจ UID ก่อนสร้าง order แล้วเริ่ม MyCard payment intent แบบ TW/TWD ส่ง `Idempotency-Key` เพื่อให้ retry ได้ปลอดภัย ตอบ order ID, status, payment URL และจำนวนเงิน โค้ดบันทึก schema สำหรับ top-up attempts แต่ยังต้องเพิ่ม worker ที่เรียก top-up endpoint ทางการหลังยืนยันชำระเงิน; หาก upstream ผลไม่ชัดเจนให้ reconcile ก่อน retry เพื่อไม่เติมซ้ำ

### `POST /api/v1/payments/mycard/callback`

ตรวจลายเซ็น callback และอัปเดตสถานะ payment ใน transaction; implementation ของ canonicalization ยังเป็น placeholder ต้องแทนด้วย contract ทางการ และควรเรียก worker ผ่าน queue/outbox หลัง commit

### `GET /api/v1/orders/:orderId`

อ่านสถานะ order จาก public ID ตัวอย่างนี้ยังไม่มี customer authentication ต้องเพิ่ม authorization ก่อนเปิดใช้จริง

## Edge cases และ hardening

- **Rate limit:** เคารพ `Retry-After`, ใช้ exponential backoff พร้อม jitter และจำกัด concurrency ต่อ UID/IP; อย่า retry การสร้าง payment โดยไม่มี idempotency
- **IP blocking:** หยุด traffic เก็บ request ID/เวลา/status แบบไม่เปิดเผย secret และติดต่อผู้ให้บริการเพื่อแก้สาเหตุหรือขอ allowlist ห้ามหมุน proxy/IP เพื่อหลบการบล็อก
- **CAPTCHA/challenge:** ส่งสถานะ `CHALLENGE` ให้ operator ใช้ flow/support ที่ผู้ให้บริการอนุมัติ ห้าม bypass CAPTCHA
- **UID/server ผิด:** validate รูปแบบก่อนเรียก upstream และคืน `NOT_FOUND`/`INVALID_SERVER`; ไม่สร้าง order หาก verify ไม่ผ่าน
- **ชำระซ้ำ/ปลอม:** ตรวจ signature, event ID, order, amount, TWD, TW, merchant และ state transition ใน transaction; callback ซ้ำต้อง idempotent
- **Secrets/ข้อมูลผู้เล่น:** ใช้ secret manager, TLS, retention และ redacted logs; ไม่เก็บ password หรือ payment credential
- **Production:** เพิ่ม authentication, per-customer rate limit, metrics/alerts, migrations, backup/restore, queue และ reconciliation

## ขอบเขตที่ต้องเติมก่อนใช้งานจริง

ยังไม่มี endpoint/credentials หรือเอกสารจริงของ Aniimo/MyCard จึงยืนยันการเชื่อมต่อไม่ได้ ต้องใส่ endpoint, mapping, auth/signature contract จากผู้ให้บริการ และทดสอบ sandbox ก่อน การเติมไอเทมจริงต้องเพิ่ม worker ที่เรียก top-up endpoint ซึ่งได้รับอนุญาต
