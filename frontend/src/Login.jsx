import { useState } from 'react'
import { CalendarDays, ShieldCheck, Users, Zap, User, Lock, Eye, EyeOff, GraduationCap, BookOpen, ArrowRight, Sparkles } from 'lucide-react'
import { ROLES, DEMO, checkLogin } from './auth.js'

const ROLE_ICONS = { coordinator: ShieldCheck, faculty: BookOpen, student: GraduationCap }
const FEATURES = [
  [Zap, 'Generated in seconds', 'Greedy placement with backtracking finds a timetable for every division.'],
  [ShieldCheck, 'Clash-free, audited', 'Every result is re-checked for teacher, room and batch clashes.'],
  [Users, 'One place for everyone', 'Coordinators approve, faculty and students see their own view.'],
]
// Decorative mini timetable on the welcome panel.
const PREVIEW = [
  ['#7dd3fc', '#fcd34d', null, '#a7f3d0', '#f9a8d4'],
  ['#c4b5fd', null, '#7dd3fc', '#fcd34d', null],
  [null, '#a7f3d0', '#f9a8d4', null, '#c4b5fd'],
  ['#fcd34d', '#c4b5fd', null, '#7dd3fc', '#a7f3d0'],
]

export default function Login({ onLogin }) {
  const [role, setRole] = useState('coordinator')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')

  const submit = (e) => {
    e.preventDefault()
    if (!username.trim() || !password) return setError('Enter username and password.')
    if (!checkLogin(role, username, password)) return setError('Invalid username or password for this role.')
    onLogin({ role, name: username.trim() })
  }
  const fillDemo = () => { setUsername(DEMO[role].username); setPassword(DEMO[role].password); setError('') }

  return (
    <div className="login-wrap">
      <div className="login-brand">
        <div className="blob b1" /><div className="blob b2" /><div className="blob b3" />
        <div className="brand-row">
          <div className="brand-logo"><CalendarDays size={26} /></div>
          <div><b>ClassSync</b><small>Smart Academic Timetable</small></div>
        </div>
        <h1>Timetables that <span>never clash.</span></h1>
        <p className="lead">Constraint-based scheduling for divisions, batches, faculty, rooms and labs — built for your department.</p>

        <div className="preview" aria-hidden="true">
          <div className="preview-head">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d) => <span key={d}>{d}</span>)}</div>
          {PREVIEW.map((row, r) => (
            <div className="preview-row" key={r}>
              {row.map((c, i) => <span key={i} style={c ? { background: c, animationDelay: `${(r * 5 + i) * 70}ms` } : undefined} className={c ? 'cell' : 'cell empty'} />)}
            </div>
          ))}
        </div>

        <div className="features">
          {FEATURES.map(([Icon, title, text]) => (
            <div className="feature" key={title}>
              <div className="feature-icon"><Icon size={18} /></div>
              <div><b>{title}</b><small>{text}</small></div>
            </div>
          ))}
        </div>
      </div>

      <div className="login-side">
        <form className="login-card" onSubmit={submit}>
          <div className="login-head">
            <span className="hello"><Sparkles size={14} /> Welcome back</span>
            <h2>Sign in to ClassSync</h2>
            <p className="muted">Choose your role to continue.</p>
          </div>
          <div className="roles">
            {Object.entries(ROLES).map(([k, r]) => {
              const Icon = ROLE_ICONS[k] || User
              return (
                <button type="button" key={k} className={'role' + (role === k ? ' on' : '')} onClick={() => { setRole(k); setError('') }}>
                  <Icon size={20} />
                  <b>{r.label.replace('Timetable ', '').replace(' Member', '')}</b>
                  <small>{r.hint}</small>
                </button>
              )
            })}
          </div>
          <label>Username
            <div className="field">
              <User size={17} />
              <input value={username} placeholder={DEMO[role].username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
            </div>
          </label>
          <label>Password
            <div className="field">
              <Lock size={17} />
              <input type={showPw ? 'text' : 'password'} value={password} placeholder="••••••••" onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              <button type="button" className="eye" onClick={() => setShowPw(!showPw)} title={showPw ? 'Hide password' : 'Show password'}>{showPw ? <EyeOff size={17} /> : <Eye size={17} />}</button>
            </div>
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" className="primary">Sign in <ArrowRight size={17} /></button>
          <div className="demo">
            <span>Demo: <code>{DEMO[role].username}</code> / <code>{DEMO[role].password}</code></span>
            <button type="button" className="link" onClick={fillDemo}>Use demo login</button>
          </div>
        </form>
      </div>
    </div>
  )
}
