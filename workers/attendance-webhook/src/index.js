const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) })
    }

    if (request.method === 'GET' && new URL(request.url).pathname === '/api/enrollments') {
      return proxyEnrollments(request, env)
    }

    if (request.method === 'POST' && new URL(request.url).pathname === '/api/webhooks/receive') {
      return receivePartnerWebhook(request, env)
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
        event_id: payload.eventId,
        event: 'attendance.recorded',
        timestamp: payload.occurredAt || new Date().toISOString(),
        data: {
          student_code: payload.studentCode || claims.sub,
          course_code: payload.courseCode || '',
          section_number: payload.sectionNumber || '',
          attendance_status: payload.status.toUpperCase(),
          check_in_time: payload.occurredAt || new Date().toISOString(),
          room: payload.room || '',
          device_id: payload.deviceId || 'attendanceflow-web',
        },
      })
      const result = await deliverAttendance(body, payload.eventId, env)
      return json(result.value, result.status, env)
    } catch (error) {
      return json({ success: false, error: error.message || 'WEBHOOK_FAILED' }, error.status || 400, env)
    }
  },
}

async function receivePartnerWebhook(request, env) {
  const secret = request.headers.get('x-webhook-secret')
  const signature = request.headers.get('x-unienroll-signature')
  const rawBody = await request.clone().text()
  const secretValid = Boolean(secret && secret === env.WEBHOOK_SECRET)
  const signatureValid = Boolean(signature && env.UNIENROLL_SIGNATURE_SECRET
    && await verifyHmac(rawBody, signature, env.UNIENROLL_SIGNATURE_SECRET))
  if (!secretValid && !signatureValid) {
    return json({ success: false, error: 'INVALID_WEBHOOK_SECRET' }, 401, env)
  }

  let payload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return json({ success: false, error: 'INVALID_JSON' }, 400, env)
  }
  if (!payload?.event_id || !payload?.event || !payload?.data) {
    return json({ success: false, error: 'INVALID_WEBHOOK_PAYLOAD' }, 400, env)
  }

  const eventKey = `received:${payload.event_id}`
  if (env.EVENT_STORE) {
    const existing = await env.EVENT_STORE.get(eventKey)
    if (existing) {
      return json({ success: true, status: 'DUPLICATE_IGNORED', event_id: payload.event_id, idempotent_replay: true }, 200, env)
    }
    await env.EVENT_STORE.put(eventKey, JSON.stringify({
      event: payload.event,
      receivedAt: new Date().toISOString(),
      payload,
    }))
  }

  console.log(JSON.stringify({
    event: 'partner.webhook.received',
    eventId: payload.event_id,
    eventType: payload.event,
    stored: Boolean(env.EVENT_STORE),
  }))
  return json({ success: true, status: 'VERIFIED', event_id: payload.event_id, processed: true }, 200, env)
}

async function deliverAttendance(body, eventId, env) {
  const targetUrl = env.TEAM03_WEBHOOK_URL || 'https://unienroll-backend.team03-enrollment.workers.dev/api/webhooks/incoming'
  let lastStatus = 502
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)
    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-webhook-secret': env.WEBHOOK_SECRET,
          'idempotency-key': eventId,
        },
        body,
        signal: controller.signal,
      })
      lastStatus = response.status
      if (response.ok) {
        console.log(JSON.stringify({ event: 'webhook.delivery.succeeded', eventId, attempt, recovered: attempt > 1 }))
        return { status: 202, value: { success: true, data: { delivered: true, eventId, attempt } } }
      }
    } catch (error) {
      console.log(JSON.stringify({ event: 'webhook.delivery.attempt_failed', eventId, attempt, error: error.name }))
    } finally {
      clearTimeout(timeout)
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1000 * (2 ** (attempt - 1))))
  }

  console.log(JSON.stringify({ event: 'webhook.delivery.failed', eventId, status: lastStatus, fallback: true }))
  return {
    status: 502,
    value: { success: false, fallback: true, error: 'PARTNER_UNAVAILABLE', retryable: true, eventId },
  }
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

async function verifyHmac(body, signature, secret) {
  const expected = `sha256=${await signBody(body, secret)}`
  return signature === expected
}

function httpError(message, status) {
  const error = new Error(message)
  error.status = status
  return error
}
