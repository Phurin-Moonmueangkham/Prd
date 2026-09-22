const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) })
    }

    if (request.method !== 'POST') {
      return json({ success: false, error: 'METHOD_NOT_ALLOWED' }, 405, env)
    }

    try {
      const token = getBearerToken(request)
      const claims = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID)
      const payload = await request.json()
      validatePayload(payload)

      const body = JSON.stringify({
        eventId: payload.eventId,
        eventType: payload.eventType,
        attendanceId: payload.attendanceId,
        sessionId: payload.sessionId,
        status: payload.status,
        studentId: claims.sub,
        occurredAt: payload.occurredAt || new Date().toISOString(),
      })
      const signature = await signBody(body, env.WEBHOOK_SECRET)
      const response = await fetch(env.TARGET_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-attendance-signature': signature,
          'x-attendance-event-id': payload.eventId,
        },
        body,
      })

      if (!response.ok) {
        return json({ success: false, error: 'TARGET_WEBHOOK_FAILED' }, 502, env)
      }

      return json({ success: true, data: { delivered: true, eventId: payload.eventId } }, 202, env)
    } catch (error) {
      return json({ success: false, error: error.message || 'WEBHOOK_FAILED' }, error.status || 400, env)
    }
  },
}

function corsHeaders(env) {
  return {
    'access-control-allow-origin': env.ALLOWED_ORIGIN || '*',
    'access-control-allow-headers': 'Authorization, Content-Type',
    'access-control-allow-methods': 'POST, OPTIONS',
  }
}

function json(value, status, env) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders(env) },
  })
}

function getBearerToken(request) {
  const value = request.headers.get('authorization') || ''
  if (!value.startsWith('Bearer ')) {
    throw httpError('UNAUTHENTICATED', 401)
  }
  return value.slice(7)
}

function validatePayload(payload) {
  const required = ['eventId', 'eventType', 'attendanceId', 'sessionId', 'status']
  if (!payload || required.some((field) => typeof payload[field] !== 'string' || !payload[field])) {
    throw httpError('INVALID_PAYLOAD', 400)
  }
  if (!['present', 'late', 'absent', 'excused'].includes(payload.status)) {
    throw httpError('INVALID_STATUS', 400)
  }
}

async function verifyFirebaseToken(token, projectId) {
  const [headerPart, payloadPart, signaturePart] = token.split('.')
  if (!headerPart || !payloadPart || !signaturePart) throw httpError('INVALID_TOKEN', 401)

  const header = decodeJson(headerPart)
  const claims = decodeJson(payloadPart)
  if (header.alg !== 'RS256' || claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}`) {
    throw httpError('INVALID_TOKEN', 401)
  }
  if (!claims.sub || claims.exp <= Math.floor(Date.now() / 1000)) throw httpError('INVALID_TOKEN', 401)

  const keys = await fetch(JWKS_URL).then((response) => response.json())
  const jwk = keys.keys.find((key) => key.kid === header.kid)
  if (!jwk) throw httpError('INVALID_TOKEN', 401)

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    base64UrlToBytes(signaturePart),
    new TextEncoder().encode(`${headerPart}.${payloadPart}`),
  )
  if (!valid) throw httpError('INVALID_TOKEN', 401)
  return claims
}

function decodeJson(value) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value)))
}

function base64UrlToBytes(value) {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function signBody(body, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function httpError(message, status) {
  const error = new Error(message)
  error.status = status
  return error
}
