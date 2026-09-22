/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {setGlobalOptions} = require("firebase-functions");
const {onRequest} = require("firebase-functions/https");
const logger = require("firebase-functions/logger");
const crypto = require("crypto");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({maxInstances: 10});

exports.attendanceWebhook = onRequest((request, response) => {
  if (request.method !== "POST") {
    response.status(405).json({success: false, error: "METHOD_NOT_ALLOWED"});
    return;
  }

  const rawBody = request.rawBody?.toString("utf8") || JSON.stringify(request.body || {});
  const payload = request.body || {};
  const signature = request.get("x-attendance-signature");
  const eventId = request.get("x-attendance-event-id") || payload.eventId;

  if (!verifySignature(rawBody, signature)) {
    response.status(401).json({success: false, error: "INVALID_SIGNATURE"});
    return;
  }

  const {eventType, attendanceId, status} = payload;
  if (!eventId || !eventType || !attendanceId || !status) {
    response.status(400).json({success: false, error: "INVALID_PAYLOAD"});
    return;
  }

  const eventRef = db.collection("integrationEvents").doc(eventId);
  db.runTransaction(async (transaction) => {
    const existing = await transaction.get(eventRef);
    if (existing.exists) return false;
    transaction.create(eventRef, {
      eventId,
      eventType,
      attendanceId,
      status,
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      rawPayload: payload,
    });
    return true;
  }).then((created) => {
    logger.info("Attendance webhook received", {
      eventId,
      eventType,
      attendanceId,
      status,
      duplicate: !created,
    });
    response.status(202).json({
      success: true,
      data: {received: true, eventId, duplicate: !created},
    });
  }).catch((error) => {
    logger.error("Attendance webhook persistence failed", {eventId, error: error.message});
    response.status(500).json({success: false, error: "WEBHOOK_PERSISTENCE_FAILED"});
  });
});

function verifySignature(body, signature) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(signature, "utf8");
  return expectedBuffer.length === actualBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}
