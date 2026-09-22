const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) })
    }

    if (request.method === 'GET' && new URL(request.url).pathname === '/api/enrollments') {
      return proxyEnrollments(request, env)
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
        console.log(JSON.stringify({
          event: 'webhook.delivery.failed',
          eventId: payload.eventId,
          status: response.status,
          recovered: false,
        }))
        return json({ success: false, error: 'TARGET_WEBHOOK_FAILED' }, 502, env)
      }

      console.log(JSON.stringify({
        event: 'webhook.delivery.succeeded',
        eventId: payload.eventId,
        recovered: true,
      }))
      return json({ success: true, data: { delivered: true, eventId: payload.eventId } }, 202, env)
    } catch (error) {
      return json({ success: false, error: error.message || 'WEBHOOK_FAILED' }, error.status || 400, env)
    }
  },
}

async function proxyEnrollments(request, env) {
  const incomingUrl = new URL(request.url)
  const courseCode = incomingUrl.searchParams.get('course_code')
  const sectionNumber = incomingUrl.searchParams.get('section_number')
  const studentCode = incomingUrl.searchParams.get('student_code')

  if ((!courseCode || !sectionNumber) && !studentCode) {
    return json({ success: false, error: 'INVALID_QUERY' }, 400, env)
  }
  if (!env.PARTNER_API_KEY) {
    return json({ success: false, error: 'PARTNER_API_KEY_NOT_CONFIGURED' }, 503, env)
  }

  const partnerUrl = new URL(studentCode
    ? `https://unienroll-backend.team03-enrollment.workers.dev/api/partner/students/${encodeURIComponent(studentCode)}/enrollments`
    : 'https://unienroll-backend.team03-enrollment.workers.dev/api/partner/enrollments')
  if (courseCode) partnerUrl.searchParams.set('course_code', courseCode)
  if (sectionNumber) partnerUrl.searchParams.set('section_number', sectionNumber)

  try {
    const partnerResponse = await fetch(partnerUrl, {
      headers: {
        'content-type': 'application/json',
        'x-partner-key': env.PARTNER_API_KEY,
        'x-partner-id': 'team-05-attendance-tracking',
      },
    })
    const body = await partnerResponse.text()
    return new Response(body, {
      status: partnerResponse.status,
      headers: { 'content-type': 'application/json', ...corsHeaders(env) },
    })
  } catch (error) {
    console.log(JSON.stringify({ event: 'enrollment.proxy.failed', error: error.message }))
    return json({ success: false, error: 'PARTNER_UNAVAILABLE' }, 502, env)
  }
}

function corsHeaders(env) {
  return {
    'access-control-allow-origin': env.ALLOWED_ORIGIN || '*',
    'access-control-allow-headers': 'Authorization, Content-Type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
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
