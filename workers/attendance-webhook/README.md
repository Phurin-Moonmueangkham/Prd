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
