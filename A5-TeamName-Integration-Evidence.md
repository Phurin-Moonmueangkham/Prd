# A5-TeamName-Integration-Evidence

> Replace `TeamName` in the filename and heading with the real team name. Attach screenshots or exported logs at every evidence marker before submission.

## Integration overview

- Consumer: AttendanceFlow React app
- Provider: Firebase HTTPS Function `attendanceWebhook`
- Webhook sender: Cloudflare Worker `attendance-webhook`
- Webhook receiver: Firebase Function `attendanceWebhook`
- Persistence: Firestore collection `integrationEvents`
- Authentication: Firebase ID token from the signed-in user
- Webhook signing: HMAC-SHA256 using `WEBHOOK_SECRET`

## 1. Consumer Proof

The browser calls `VITE_ATTENDANCE_WEBHOOK_URL` from `src/lib/attendanceApi.js` after a successful attendance check-in.

- Partner URL: `[paste deployed Worker URL]`
- Request timestamp: `[paste timestamp]`
- Request payload:

```json
{
  "eventId": "attendance-[timestamp]",
  "eventType": "attendance.created",
  "attendanceId": "session-1_STU-20241",
  "sessionId": "session-1",
  "status": "present"
}
```

- Response screenshot/log: `evidence/01-consumer-response.png`

## 2. Provider Proof

The Firebase Function accepts `POST` requests at:

```text
[paste Firebase Function URL]/attendanceWebhook
```

- Internal request log: `evidence/02-provider-log.txt`
- Partner confirmation: `evidence/02-provider-response.png`
- Expected result: HTTP `202` with `data.received: true`

## 3. Webhook Receiver

The receiver validates `x-attendance-signature` with HMAC-SHA256, validates the payload, and stores the accepted event in Firestore.

- Incoming payload: `evidence/03-incoming-payload.json`
- Secret verification result: `valid = true` in `evidence/03-receiver-log.txt`
- Stored Firestore document: `evidence/03-firestore-document.png`

## 4. Webhook Sender

The Worker receives an authenticated request from AttendanceFlow, signs the outgoing body, and forwards it to the provider URL.

- Trigger action: clicking `Check in`
- Outgoing payload: `evidence/04-outgoing-payload.json`
- Partner response log: `evidence/04-partner-response.txt`
- Expected headers: `x-attendance-signature`, `x-attendance-event-id`

## 5. Idempotency Proof

Send the exact same payload twice with the same `eventId`.

- Request 1 response: `202`, `duplicate: false`
- Request 2 response: `202`, `duplicate: true`
- Firestore proof: exactly one `integrationEvents/{eventId}` document
- Attachments: `evidence/05-request-1.txt`, `evidence/05-request-2.txt`, `evidence/05-single-firestore-record.png`

## 6. Degradation Proof

Temporarily point `TARGET_WEBHOOK_URL` to an unavailable endpoint or stop the local provider.

- Breakage timestamp: `[paste timestamp]`
- Worker response: `502 TARGET_WEBHOOK_FAILED`
- Fallback JSON output: `evidence/06-fallback-response.json`
- Recovery request and log after restoring the provider: `evidence/06-recovery-log.txt`

## Test summary

| Requirement | Result | Evidence |
| --- | --- | --- |
| Consumer proof | `[PASS/FAIL]` | `evidence/01-*` |
| Provider proof | `[PASS/FAIL]` | `evidence/02-*` |
| Webhook receiver | `[PASS/FAIL]` | `evidence/03-*` |
| Webhook sender | `[PASS/FAIL]` | `evidence/04-*` |
| Idempotency | `[PASS/FAIL]` | `evidence/05-*` |
| Degradation and recovery | `[PASS/FAIL]` | `evidence/06-*` |