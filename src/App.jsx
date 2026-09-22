import { useEffect, useState } from 'react'
import {
  ArrowUpRight,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  LayoutDashboard,
  Menu,
  Plus,
  QrCode,
  RefreshCw,
  Settings,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react'

import { auth, isFirebaseConfigured } from './lib/firebase'
import { listPartnerEnrollments, sendAttendanceWebhook, signIn } from './lib/attendanceApi'

const initialSessions = [
  { id: 1, code: 'CS204', name: 'Human Computer Interaction', room: 'Studio 3B', time: '09:00 - 10:30', date: 'Today', state: 'active', present: 38, total: 42, accent: 'coral' },
  { id: 2, code: 'CS318', name: 'Data Structures', room: 'Lecture Hall 2', time: '13:00 - 14:30', date: 'Today', state: 'upcoming', present: 0, total: 36, accent: 'sage' },
  { id: 3, code: 'CS110', name: 'Digital Systems', room: 'Lab 1A', time: '09:00 - 10:30', date: 'Tomorrow', state: 'upcoming', present: 0, total: 40, accent: 'blue' },
]

const initialStudents = [
  { name: 'You', id: 'STU-20241', status: 'present', time: '09:12' },
  { name: 'Mali Srisuk', id: 'STU-20218', status: 'present', time: '09:04' },
  { name: 'Niran Chaiyo', id: 'STU-20232', status: 'late', time: '09:27' },
  { name: 'Ploy Kittisak', id: 'STU-20244', status: 'present', time: '09:08' },
  { name: 'Krit Anuman', id: 'STU-20251', status: 'absent', time: '—' },
]

function App() {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(isFirebaseConfigured)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [demoMode, setDemoMode] = useState(false)
  const [view, setView] = useState('overview')
  const [sessions, setSessions] = useState(initialSessions)
  const [students, setStudents] = useState(initialStudents)
  const [notice, setNotice] = useState('')
  const [mobileNav, setMobileNav] = useState(false)
  const [enrollments, setEnrollments] = useState([])
  const [enrollmentLoading, setEnrollmentLoading] = useState(false)
  const [enrollmentError, setEnrollmentError] = useState('')
  const [enrollmentQuery, setEnrollmentQuery] = useState({ courseCode: 'CS101', sectionNumber: 'SEC01' })

  const activeSession = sessions.find((session) => session.state === 'active')
  const presentCount = students.filter((student) => student.status === 'present').length
  const lateCount = students.filter((student) => student.status === 'late').length
  const absentCount = students.filter((student) => student.status === 'absent').length

  useEffect(() => {
    if (!auth) return undefined
    return auth.onAuthStateChanged((nextUser) => {
      setUser(nextUser)
      setAuthLoading(false)
    })
  }, [])

  useEffect(() => {
    if (view === 'enrollments') loadEnrollments()
  }, [view])

  async function loadEnrollments(event) {
    event?.preventDefault()
    setEnrollmentLoading(true)
    setEnrollmentError('')
    try {
      const result = await listPartnerEnrollments(enrollmentQuery)
      setEnrollments(result.data || [])
    } catch (error) {
      setEnrollmentError(error.message || 'Unable to load enrollment roster.')
      setEnrollments([])
    } finally {
      setEnrollmentLoading(false)
    }
  }

  async function handleLogin(event) {
    event.preventDefault()
    setAuthError('')
    try {
      await signIn(email, password)
    } catch (error) {
      setAuthError(error.code === 'auth/invalid-credential'
        ? 'Email or password is incorrect.'
        : 'Unable to sign in. Check your Firebase Auth setup.')
    }
  }

  async function markAttendance() {
    setStudents((current) => current.map((student) => student.name === 'You' ? { ...student, status: 'present', time: 'Now' } : student))
    setNotice('Attendance confirmed for Human Computer Interaction')
    try {
      await sendAttendanceWebhook({
        eventId: `attendance-${Date.now()}`,
        eventType: 'attendance.created',
        attendanceId: 'session-1_STU-20241',
        sessionId: 'session-1',
        studentCode: '65010042',
        courseCode: 'CS101',
        sectionNumber: 'SEC01',
        room: 'CB2-301',
        status: 'present',
      })
    } catch {
      setNotice('Attendance saved, but webhook delivery failed')
    }
    setTimeout(() => setNotice(''), 3500)
  }

  function createSession(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const newSession = {
      id: Date.now(),
      code: form.get('code'),
      name: form.get('name'),
      room: form.get('room'),
      time: `${form.get('start')} - ${form.get('end')}`,
      date: 'Today',
      state: 'upcoming',
      present: 0,
      total: 42,
      accent: 'blue',
    }
    setSessions((current) => [...current, newSession])
    setNotice(`${newSession.code} session created`)
    event.currentTarget.reset()
    setTimeout(() => setNotice(''), 3500)
  }

  if (authLoading) return <div className="auth-loading">Loading AttendanceFlow...</div>
  if (!user && !demoMode) return <LoginPage email={email} password={password} setEmail={setEmail} setPassword={setPassword} authError={authError} onSubmit={handleLogin} onDemo={() => setDemoMode(true)} firebaseConfigured={isFirebaseConfigured} />

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'is-open' : ''}`}>
        <div className="brand"><span className="brand-mark"><Check size={17} strokeWidth={3} /></span><span>Attendance<span>Flow</span></span></div>
        <div className="profile-mini"><div className="avatar coral-avatar">AM</div><div><strong>Araya Meesuk</strong><small>Student account</small></div><ChevronRight size={16} /></div>
        <nav>
          <button className={view === 'overview' ? 'nav-item active' : 'nav-item'} onClick={() => { setView('overview'); setMobileNav(false) }}><LayoutDashboard size={18} />Overview</button>
          <button className={view === 'sessions' ? 'nav-item active' : 'nav-item'} onClick={() => { setView('sessions'); setMobileNav(false) }}><CalendarDays size={18} />My sessions</button>
          <button className={view === 'reports' ? 'nav-item active' : 'nav-item'} onClick={() => { setView('reports'); setMobileNav(false) }}><BarChart3 size={18} />Reports</button>
          <button className={view === 'enrollments' ? 'nav-item active' : 'nav-item'} onClick={() => { setView('enrollments'); setMobileNav(false) }}><Users size={18} />Enrollment roster</button>
        </nav>
        <div className="sidebar-bottom"><button className="nav-item"><Settings size={18} />Settings</button><button className="nav-item"><CircleHelp size={18} />Help center</button><div className="semester"><small>Current semester</small><strong>2026 / Semester 1</strong><span>● Connected</span></div></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><button className="menu-button" onClick={() => setMobileNav(!mobileNav)}><Menu size={21} /></button><div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong>{view === 'overview' ? 'Overview' : view === 'sessions' ? 'My sessions' : view === 'reports' ? 'Reports' : 'Enrollment roster'}</strong></div><div className="top-actions"><button className="icon-button" aria-label="Notifications"><Bell size={19} /><i /></button><div className="top-avatar">AM</div></div></header>

        <div className="page-wrap">
          <section className="welcome-row"><div><p className="eyebrow">Tuesday, September 22, 2026</p><h1>{view === 'overview' ? 'Good morning, Araya' : view === 'sessions' ? 'Your sessions' : view === 'reports' ? 'Attendance reports' : 'Enrollment roster'}</h1><p className="muted">{view === 'overview' ? 'Here is your attendance pulse for today.' : view === 'enrollments' ? 'Live student enrollment from UniEnroll Team 03.' : 'Keep your classes and attendance records in one place.'}</p></div><button className="outline-button"><QrCode size={17} /> Scan session code</button></section>

          {notice && <div className="toast"><Check size={17} />{notice}<button onClick={() => setNotice('')}><X size={15} /></button></div>}

          {view === 'overview' && <>
            <section className="stat-grid"><StatCard label="Attendance rate" value="92.4%" detail="+4.8% from last month" icon={<BarChart3 size={19} />} tone="coral" /><StatCard label="Sessions attended" value="24 / 26" detail="2 sessions remaining this week" icon={<Check size={19} />} tone="sage" /><StatCard label="Next session" value="13:00" detail="Data Structures · Hall 2" icon={<Clock3 size={19} />} tone="blue" /></section>
            <section className="content-grid"><div className="panel session-panel"><div className="panel-heading"><div><p className="eyebrow">Live now</p><h2>Active session</h2></div><span className="live-pill"><i /> Open for check-in</span></div>{activeSession && <div className="active-card"><div className="session-art coral-art"><BookOpen size={29} /></div><div className="active-info"><span className="course-code">{activeSession.code}</span><h3>{activeSession.name}</h3><p><Clock3 size={15} /> {activeSession.time} <span>·</span> {activeSession.room}</p><div className="progress-line"><span style={{ width: `${(activeSession.present / activeSession.total) * 100}%` }} /></div><small>{activeSession.present} of {activeSession.total} students checked in</small></div><button className="primary-button" onClick={markAttendance}><Check size={17} /> Check in</button></div>}<div className="panel-footer"><span>Need help with check-in?</span><button className="text-button">View instructions <ArrowUpRight size={14} /></button></div></div><div className="panel weekly-panel"><div className="panel-heading"><div><p className="eyebrow">This week</p><h2>Attendance pulse</h2></div><button className="more-button">···</button></div><div className="donut-wrap"><div className="donut"><div><strong>92%</strong><small>on track</small></div></div><div className="legend"><Legend color="coral" label="Present" value="24" /><Legend color="amber" label="Late" value="1" /><Legend color="gray" label="Absent" value="1" /></div></div><div className="week-bars"><span style={{ height: '70%' }} /><span style={{ height: '90%' }} /><span style={{ height: '80%' }} /><span className="today" style={{ height: '100%' }} /><span style={{ height: '55%' }} /><span style={{ height: '35%' }} /><span style={{ height: '25%' }} /></div><div className="day-labels"><small>Mon</small><small>Tue</small><small>Wed</small><small>Thu</small><small>Fri</small><small>Sat</small><small>Sun</small></div></div></section>
            <section className="panel upcoming-panel"><div className="panel-heading"><div><p className="eyebrow">Schedule</p><h2>Upcoming sessions</h2></div><button className="text-button" onClick={() => setView('sessions')}>View all <ArrowUpRight size={14} /></button></div><div className="session-list">{sessions.filter((session) => session.state !== 'active').map((session) => <SessionRow key={session.id} session={session} />)}</div></section>
          </>}

          {view === 'sessions' && <section className="sessions-view"><div className="panel session-manager"><div className="panel-heading"><div><p className="eyebrow">Your timetable</p><h2>All sessions</h2></div><button className="primary-button" onClick={() => document.getElementById('create-session').showModal()}><Plus size={17} /> New session</button></div><div className="session-list">{sessions.map((session) => <SessionRow key={session.id} session={session} detailed />)}</div></div><dialog id="create-session"><form onSubmit={createSession}><button type="button" className="dialog-close" onClick={() => document.getElementById('create-session').close()}><X size={18} /></button><p className="eyebrow">Instructor tool</p><h2>Create a session</h2><label>Course code<input name="code" required placeholder="e.g. CS204" /></label><label>Course name<input name="name" required placeholder="e.g. Human Computer Interaction" /></label><label>Room<input name="room" required placeholder="e.g. Studio 3B" /></label><div className="time-inputs"><label>Starts<input type="time" name="start" required defaultValue="09:00" /></label><label>Ends<input type="time" name="end" required defaultValue="10:30" /></label></div><button className="primary-button" type="submit">Create session <ArrowUpRight size={16} /></button></form></dialog></section>}

          {view === 'reports' && <section className="reports-view"><div className="report-hero"><div><p className="eyebrow">Course overview</p><h2>Human Computer Interaction</h2><p>CS204 · 42 enrolled students · Fall 2026</p></div><span className="status-badge green"><ShieldCheck size={15} /> Healthy attendance</span></div><div className="report-cards"><StatCard label="Present today" value={presentCount} detail="57.1% of the class" icon={<Check size={19} />} tone="sage" /><StatCard label="Late today" value={lateCount} detail="Requires no action" icon={<Clock3 size={19} />} tone="amber" /><StatCard label="Absent today" value={absentCount} detail="Review before closing" icon={<Users size={19} />} tone="coral" /></div><div className="panel roster-panel"><div className="panel-heading"><div><p className="eyebrow">Live roster</p><h2>Today, 22 September</h2></div><span className="muted">Last updated just now</span></div><div className="roster-head"><span>Student</span><span>Status</span><span>Time</span></div>{students.map((student) => <div className="roster-row" key={student.id}><div className="student-cell"><div className="student-avatar">{student.name.split(' ').map((word) => word[0]).join('').slice(0, 2)}</div><div><strong>{student.name}</strong><small>{student.id}</small></div></div><Status status={student.status} /><span className="time-cell">{student.time}</span></div>)}</div></section>}
          {view === 'enrollments' && <section className="enrollments-view"><div className="panel enrollment-panel"><div className="panel-heading"><div><p className="eyebrow">Partner integration</p><h2>Active student enrollment</h2><p className="panel-subtitle">UniEnroll Team 03 · {enrollments.length} students found</p></div><button className="outline-button refresh-button" onClick={() => loadEnrollments()} disabled={enrollmentLoading}><RefreshCw size={16} className={enrollmentLoading ? 'spin' : ''} /> Refresh</button></div><form className="enrollment-filters" onSubmit={loadEnrollments}><label>Course code<input value={enrollmentQuery.courseCode} onChange={(event) => setEnrollmentQuery((current) => ({ ...current, courseCode: event.target.value.toUpperCase() }))} placeholder="CS101" /></label><label>Section<input value={enrollmentQuery.sectionNumber} onChange={(event) => setEnrollmentQuery((current) => ({ ...current, sectionNumber: event.target.value.toUpperCase() }))} placeholder="SEC01" /></label><button className="primary-button" type="submit" disabled={enrollmentLoading}>Load roster <ArrowUpRight size={16} /></button></form>{enrollmentLoading && <div className="enrollment-state">Loading enrollment roster...</div>}{enrollmentError && <div className="enrollment-error">{enrollmentError}</div>}{!enrollmentLoading && !enrollmentError && enrollments.length === 0 && <div className="enrollment-state">No enrolled students found for this course and section.</div>}{!enrollmentLoading && !enrollmentError && enrollments.length > 0 && <div className="enrollment-table"><div className="enrollment-table-head"><span>Student</span><span>Course</span><span>Schedule</span><span>Status</span></div>{enrollments.map((student) => <div className="enrollment-row" key={student.enrollment_id}><div className="student-cell"><div className="student-avatar">{student.student_name.split(' ').map((word) => word[0]).join('').slice(0, 2)}</div><div><strong>{student.student_name}</strong><small>{student.student_code} · {student.major}</small></div></div><div><strong>{student.course_code}</strong><small>{student.course_title}</small></div><div><strong>{student.section_number}</strong><small>{student.schedule} · {student.room}</small></div><span className="status-badge present"><i />{student.status}</span></div>)}</div>}</div></section>}
        </div>
      </main>
    </div>
  )
}

function LoginPage({ email, password, setEmail, setPassword, authError, onSubmit, onDemo, firebaseConfigured }) {
  return <main className="login-page">
    <section className="login-art"><div className="login-art-copy"><span className="brand-mark"><Check size={17} strokeWidth={3} /></span><p className="eyebrow">AttendanceFlow</p><h1>Make every class count.</h1><p>One clear place to check in, stay on track, and keep your academic rhythm visible.</p></div><div className="login-orbit orbit-one" /><div className="login-orbit orbit-two" /></section>
    <section className="login-panel"><div className="login-form-wrap"><div className="mobile-brand"><span className="brand-mark"><Check size={17} strokeWidth={3} /></span><strong>Attendance<span>Flow</span></strong></div><p className="eyebrow">Welcome back</p><h2>Sign in to your workspace</h2><p className="login-muted">Use your university email to continue.</p><form onSubmit={onSubmit}><label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@university.ac.th" required autoComplete="email" /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required autoComplete="current-password" /></label>{authError && <p className="auth-error">{authError}</p>}<button className="primary-button login-button" type="submit">Sign in <ArrowUpRight size={16} /></button></form>{!firebaseConfigured && <button className="demo-button" onClick={onDemo}>Continue in demo mode</button>}<p className="login-footnote">Protected by Firebase Authentication</p></div></section>
  </main>
}

function StatCard({ label, value, detail, icon, tone }) { return <div className={`stat-card ${tone}`}><div className="stat-icon">{icon}</div><p>{label}</p><strong>{value}</strong><small>{detail}</small></div> }
function Legend({ color, label, value }) { return <div><span className={`legend-dot ${color}`} />{label}<strong>{value}</strong></div> }
function Status({ status }) { return <span className={`status-badge ${status}`}><i />{status}</span> }
function SessionRow({ session, detailed = false }) { return <div className="session-row"><div className={`session-art ${session.accent}-art`}><BookOpen size={21} /></div><div className="session-row-info"><div><span className="course-code">{session.code}</span><span className="date-label">{session.date}</span></div><strong>{session.name}</strong><small><Clock3 size={13} />{session.time}<span>·</span>{session.room}</small></div><div className="session-row-meta">{session.state === 'active' ? <span className="live-pill"><i />Live</span> : <span className="status-badge upcoming"><i />Upcoming</span>}{detailed && <span className="roster-count"><Users size={14} /> {session.total} students</span>}</div><ChevronRight className="row-arrow" size={18} /></div> }

export default App
