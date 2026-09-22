# A5-Team07-Attendance-Integration-Evidence

## Integration overview

| Item | Details |
| --- | --- |
| Team | Team 07 Attendance |
| Partner | UniEnroll Team 03 |
| Integration | Enrollment API plus attendance webhook integration |
| Our endpoint | `https://attendanceflow-webhook.6731503026.workers.dev/api/enrollments` |
| Partner endpoint | `https://unienroll-backend.team03-enrollment.workers.dev/api/partner/enrollments` |
| Authentication | Server-side `X-Partner-Key` stored as a Cloudflare Worker secret |
| Partner ID currently used by deployed Worker | `team-05-attendance-tracking` |

## 1. Consumer Proof: PASS

AttendanceFlow calls the Team 07 Attendance Cloudflare proxy. The proxy adds partner credentials server-side and returns the Team 03 response without exposing the key to the browser.

### Successful roster request

```text
GET https://attendanceflow-webhook.6731503026.workers.dev/api/enrollments?course_code=CS101&section_number=SEC01
```

Result: `200 OK`, `success: true`, provider `UniEnroll Team 03`, one active student returned.

![Successful active enrollment roster request](pic/Screenshot%202026-09-22%20220306.png)

### Student lookup request

```text
GET https://attendanceflow-webhook.6731503026.workers.dev/api/enrollments?student_code=65010042
```

Result: `200 OK`, student `65010042` / `Somchai Prasert` returned with three enrollment records.

![Successful student enrollment lookup](pic/Screenshot%202026-09-22%20221042.png)

### Unknown course and section

```text
GET https://attendanceflow-webhook.6731503026.workers.dev/api/enrollments?course_code=UNKNOWN&section_number=SEC99
```

Result: `200 OK` with `total_active_students: 0` and an empty `data` array.

![Unknown course and section returns an empty roster](pic/Screenshot%202026-09-22%20220616.png)

### Postman collection run

The Postman collection executed 3 requests and all 10 assertions passed with 0 failures.

![Postman collection run with 10 passed tests](pic/Screenshot%202026-09-22%20221548.png)

## 2. Provider Proof: PASS

The Team 07 Attendance provider endpoint is the deployed Cloudflare Worker:

```text
https://attendanceflow-webhook.6731503026.workers.dev/api/enrollments
```

The Postman response confirms the provider chain by returning `provider: "UniEnroll Team 03"` and the enrollment JSON contract.

![Provider response confirming UniEnroll Team 03 data](pic/Screenshot%202026-09-22%20220306.png)

The partner key is stored as a Cloudflare secret and is intentionally not included in this document.

## 3. Webhook Receiver: PASS

Team 07 exposes this receiver for enrollment and schedule events from Team 03:

```text
POST https://attendanceflow-webhook.6731503026.workers.dev/api/webhooks/receive
```

The receiver accepts `X-UniEnroll-Signature: sha256=<HMAC>` and deduplicates `event_id` in Cloudflare KV.

### First receiver request

The receiver returned `200 OK`, `status: VERIFIED`, and `processed: true`.

![Webhook receiver first request verified](pic/Screenshot%202026-09-22%20232234.png)

### Duplicate receiver request

The repeated `event_id` returned `200 OK`, `DUPLICATE_IGNORED`, and `idempotent_replay: true`.

![Webhook receiver duplicate request ignored](pic/Screenshot%202026-09-22%20232407.png)

## 4. Webhook Sender: PASS

AttendanceFlow sends attendance events to Team 03:

```text
POST https://unienroll-backend.team03-enrollment.workers.dev/api/webhooks/incoming
```

The Worker sends `X-Webhook-Secret` and `Idempotency-Key: <event_id>` with the documented `attendance.recorded` payload.

- Trigger action: click `Check in` in AttendanceFlow
The Postman request returned `202 Accepted`, `delivered: true`, and `attempt: 1`.

![Attendance webhook delivered to Team 03](pic/Screenshot%202026-09-22%20233532.png)

## 5. Idempotency Proof: PARTIAL

The Worker uses `event_id` as the webhook deduplication key and stores received events in Cloudflare KV. The same event is not processed twice.

- Request 1 and Request 2 evidence are shown in the receiver screenshots above.
- Behavioral proof: the second request returned `DUPLICATE_IGNORED`.
- Remaining evidence: screenshot of Cloudflare KV key `received:evt-postman-001` showing exactly one stored event.

## 6. Degradation Proof: READY FOR TEST

The proxy has structured error handling. During setup, the following states were observed:

- `503 PARTNER_API_KEY_NOT_CONFIGURED` before the Cloudflare secret was configured.
- `401 Unauthorized` when the partner key was invalid.
- `200 OK` after the correct key was configured, proving recovery.

Attendance delivery uses a 4-second timeout, exponential backoff delays of 1, 2, and 4 seconds, and a structured fallback response:

```json
{
	"success": false,
	"fallback": true,
	"error": "PARTNER_UNAVAILABLE",
	"retryable": true
}
```

- Breakage evidence: `evidence/06-fallback-response.json`
- Recovery evidence: `evidence/06-recovery-log.txt`

## Test summary

| Requirement | Result | Evidence |
| --- | --- | --- |
| Consumer proof | PASS | Postman screenshots and collection run |
| Provider proof | PASS | Worker response and partner contract screenshots |
| Webhook receiver | PASS | First and duplicate receiver screenshots |
| Webhook sender | PASS | Team 03 delivery returned `202 Accepted` |
| Idempotency | PARTIAL | Duplicate response captured; KV record screenshot remains |
| Degradation and recovery | READY FOR TEST | 4-second timeout, 3 attempts, fallback JSON |

## Additional information required from Team 03

1. `WEBHOOK_SECRET` for Team 03 incoming attendance requests.
2. `UNIENROLL_SIGNATURE_SECRET` for verifying Team 03 outgoing HMAC events.
3. A fresh partner key because the test key was exposed during setup.

## Team identity follow-up

The document identity is now Team 07 Attendance, but the deployed Worker still sends `X-Partner-Id: team-05-attendance-tracking`. Ask Team 03 to confirm whether this ID must be changed to `team-07-attendance-tracking`. If they approve the change, update the Worker, redeploy it, and capture a new successful Postman response before submitting.
