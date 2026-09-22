import { signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { addDoc, collection, doc, getDocs, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore'
import { auth, db, isFirebaseConfigured } from './firebase'

function requireFirebase() {
  if (!isFirebaseConfigured || !auth || !db) {
    throw new Error('Firebase is not configured. Add VITE_FIREBASE_* values to .env.local.')
  }
}

export async function signIn(email, password) {
  requireFirebase()
  return signInWithEmailAndPassword(auth, email, password)
}

export async function signOutUser() {
  requireFirebase()
  return signOut(auth)
}

export async function sendAttendanceWebhook(event) {
  const webhookUrl = import.meta.env.VITE_ATTENDANCE_WEBHOOK_URL
  if (!webhookUrl || !auth?.currentUser) return { delivered: false, skipped: true }

  const token = await auth.currentUser.getIdToken()
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  })
  if (!response.ok) throw new Error('Webhook delivery failed')
  return response.json()
}

export async function listCourseSessions(courseId) {
  requireFirebase()
  const sessionsQuery = query(collection(db, 'courses', courseId, 'sessions'), where('status', '!=', 'cancelled'))
  const snapshot = await getDocs(sessionsQuery)
  return snapshot.docs.map((session) => ({ id: session.id, ...session.data() }))
}

export async function markAttendance({ sessionId, courseId, studentId, status = 'present' }) {
  requireFirebase()
  const attendanceId = `${sessionId}_${studentId}`
  const attendanceRef = doc(db, 'attendance', attendanceId)
  const batch = writeBatch(db)
  batch.set(attendanceRef, {
    sessionId,
    courseId,
    studentId,
    status,
    markedBy: studentId,
    markedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: false })
  batch.set(doc(collection(db, 'webhookEvents')), {
    eventType: 'attendance.created',
    attendanceId,
    status: 'pending',
    createdAt: serverTimestamp(),
  })
  await batch.commit()
  return { id: attendanceId, sessionId, courseId, studentId, status }
}

export async function createCourseSession({ courseId, title, room, startTime, endTime, createdBy }) {
  requireFirebase()
  const sessionRef = await addDoc(collection(db, 'courses', courseId, 'sessions'), {
    title,
    location: room,
    startTime,
    endTime,
    createdBy,
    status: 'scheduled',
    createdAt: serverTimestamp(),
  })
  return { id: sessionRef.id, title, room, startTime, endTime, status: 'scheduled' }
}
