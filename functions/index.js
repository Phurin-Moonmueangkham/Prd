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

  const {eventType, attendanceId, status} = request.body || {};
  if (!eventType || !attendanceId || !status) {
    response.status(400).json({success: false, error: "INVALID_PAYLOAD"});
    return;
  }

  logger.info("Attendance webhook received", {
    eventType,
    attendanceId,
    status,
  });
  response.status(202).json({success: true, data: {received: true}});
});
