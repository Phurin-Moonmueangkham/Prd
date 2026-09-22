# A5-Team05-Integration-Evidence

## Integration overview

| Item | Details |
| --- | --- |
| Team | Team 05 |
| Partner | UniEnroll Team 03 |
| Integration | Authenticated read-only enrollment API |
| Our endpoint | `https://attendanceflow-webhook.6731503026.workers.dev/api/enrollments` |
| Partner endpoint | `https://unienroll-backend.team03-enrollment.workers.dev/api/partner/enrollments` |
| Authentication | Server-side `X-Partner-Key` stored as a Cloudflare Worker secret |
| Partner ID | `team-05-attendance-tracking` |

## 1. Consumer Proof: PASS

AttendanceFlow calls the Team 05 Cloudflare proxy. The proxy adds partner credentials server-side and returns the Team 03 response without exposing the key to the browser.

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

The Team 05 provider endpoint is the deployed Cloudflare Worker:

```text
https://attendanceflow-webhook.6731503026.workers.dev/api/enrollments
```

The Postman response confirms the provider chain by returning `provider: "UniEnroll Team 03"` and the enrollment JSON contract.

![Provider response confirming UniEnroll Team 03 data](pic/Screenshot%202026-09-22%20220306.png)

The partner key is stored as a Cloudflare secret and is intentionally not included in this document.

## 3. Webhook Receiver: NOT APPLICABLE

The supplied Team 03 contract provides `GET` enrollment endpoints only. It does not provide an inbound webhook URL, signed event payload, or enrollment-change event contract. Therefore there is no receiver flow to test for this integration.

Required to complete this item: an inbound webhook URL, payload schema, signature method, and storage/logging contract from Team 03.

## 4. Webhook Sender: NOT APPLICABLE

This integration reads enrollment data and does not send attendance events to Team 03. No attendance-write endpoint or webhook destination was supplied.

Required to complete this item: destination URL, HTTP method, payload, authentication, and success response for attendance events.

## 5. Idempotency Proof: NOT APPLICABLE

The current operation is read-only `GET`; it creates no records. Repeating a request cannot create a duplicate enrollment record, and no mutation/idempotency-key contract was supplied.

Required to complete this item: a write endpoint, idempotency key field, and database proof of one record after two identical requests.

## 6. Degradation Proof: PARTIAL

The proxy has structured error handling. During setup, the following states were observed:

- `503 PARTNER_API_KEY_NOT_CONFIGURED` before the Cloudflare secret was configured.
- `401 Unauthorized` when the partner key was invalid.
- `200 OK` after the correct key was configured, proving recovery.

The current read-only proxy does not persist a retry queue or implement automatic retry. A full degradation proof therefore requires an agreed fallback and retry contract plus a controlled partner outage test.

## Test summary

| Requirement | Result | Evidence |
| --- | --- | --- |
| Consumer proof | PASS | Postman screenshots and collection run |
| Provider proof | PASS | Worker response and partner contract screenshots |
| Webhook receiver | N/A | No inbound webhook contract supplied |
| Webhook sender | N/A | No attendance-write contract supplied |
| Idempotency | N/A | Current contract is read-only `GET` |
| Degradation and recovery | PARTIAL | Observed `503`, `401`, and recovered `200` states |

## Additional information required from Team 03

1. Inbound webhook URL and event payload, if enrollment changes must be pushed.
2. Attendance-write endpoint, if Team 05 must send attendance results.
3. Retry, timeout, and rate-limit policy.
4. Idempotency-key behavior for any future write endpoint.
5. A fresh partner key because the test key was exposed during setup.
