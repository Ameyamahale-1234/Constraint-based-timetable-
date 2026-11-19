import { useState } from 'react'
import { ROLES, DEMO, checkLogin } from './auth.js'

export default function Login({ onLogin }) {
  const [role, setRole] = useState('coordinator')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const submit = (e) => {
    e.preventDefault()
    if (!username.trim() || !password) return setError('Enter username and password.')
    if (!checkLogin(role, username, password)) return setError('Invalid username or password for this role.')
    onLogin({ role, name: username.trim() })
  }

  return (
    <div className="login-wrap">
      <div className="login-brand">
        <h1>Smart Academic<br />Timetable Generator</h1>
        <p>Constraint-based scheduling for divisions, batches, faculty, rooms and labs.</p>
        <ul>
          <li>Clash-free faculty, room and lab allocation</li>
          <li>Automatic timetable generation</li>
          <li>Review, adjust and approve in one place</li>
        </ul>
      </div>
      <form className="login-card" onSubmit={submit}>
        <h2>Sign in</h2>
        <div className="roles">
          {Object.entries(ROLES).map(([k, r]) => (
            <button type="button" key={k} className={'role' + (role === k ? ' on' : '')} onClick={() => { setRole(k); setError('') }}>
              <b>{r.label}</b>
              <small>{r.hint}</small>
            </button>
          ))}
        </div>
        <label>Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        </label>
        <label>Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="primary">Sign in</button>
        <p className="demo">Demo login: <code>{DEMO[role].username}</code> / <code>{DEMO[role].password}</code></p>
      </form>
    </div>
  )
}
