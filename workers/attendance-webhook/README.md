# AttendanceFlow Webhook Worker

Cloudflare Worker endpoint for the free-plan webhook integration.

## Configure and deploy

```bash
cd workers/attendance-webhook
npm install
npx wrangler login
npx wrangler secret put TARGET_WEBHOOK_URL
npx wrangler secret put WEBHOOK_SECRET
npm run deploy
```

The Worker expects `Authorization: Bearer <Firebase ID token>` and validates the token against Firebase Secure Token public keys. It forwards a minimal signed payload to `TARGET_WEBHOOK_URL`.

The endpoint returns `202` after the target accepts the event. The receiving system should use `x-attendance-event-id` for idempotency and verify `x-attendance-signature` using `WEBHOOK_SECRET`.

The Worker also proxies the Team 03 enrollment service without exposing its partner key to the browser:

```text
GET /api/enrollments?course_code=CS101&section_number=SEC01
GET /api/enrollments?student_code=65010042
```

Configure the key with:

```bash
npx wrangler secret put PARTNER_API_KEY
```

Delivery failures return a structured `502` JSON response and write a `webhook.delivery.failed` log with the event ID. A later successful retry writes `webhook.delivery.succeeded` with `recovered: true`; capture both logs for the A5 degradation and recovery evidence.

The Firebase receiver also requires the same `WEBHOOK_SECRET` and stores accepted events in the `integrationEvents` Firestore collection. Configure `WEBHOOK_SECRET` as a runtime secret/environment variable for the Firebase Function before deploying it.
