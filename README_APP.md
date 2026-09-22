# AttendanceFlow MVP

A React/Vite prototype implementing the core AttendanceFlow flows from the PRD.

## Run locally

```bash
npm install
npm run dev
```

The current build uses local mock data when Firebase is not configured, so the workflow is immediately testable. Firebase client configuration and the first Auth/Firestore API layer are now included. Copy `.env.example` to `.env.local`, fill in the Firebase Web App values, then restart Vite.

The free-plan deployment uses Firebase Hosting, Authentication, and Firestore. Cloud Functions are excluded from `firebase.json` because deploying them requires the Blaze plan. Optional webhook delivery uses the Cloudflare Worker in `workers/attendance-webhook`; set `VITE_ATTENDANCE_WEBHOOK_URL` after deploying that Worker.

## Included MVP flows

- Student overview with attendance rate and active session
- One-click attendance check-in with duplicate-safe UI state
- Upcoming session list
- Session creation dialog
- Instructor-style live roster and attendance summary
- Responsive mobile navigation and layout
