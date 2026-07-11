import { type FormEvent, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'

// §2 password reset, step 2 (build step 3c-6). Token arrives in the email
// link, is single-use, and expires server-side. On success every session
// is revoked and the user signs in fresh.

export function ResetPassword() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (pw1.length < 10) {
      setError('Password must be at least 10 characters')
      return
    }
    if (pw1 !== pw2) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      await api.resetPassword(token, pw1)
      navigate('/login', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-glow" />
      <div className="login-inner">
        <div className="login-logo-area">
          <div className="login-logo bebas">ASSET <span className="login-logo-gold">RE:SOURCE</span></div>
          <div className="login-sub">Choose a new password</div>
        </div>
        <div className="login-card">
          {!token ? (
            <div>
              <p className="reset-note">This reset link is missing its token. Request a fresh one.</p>
              <Link to="/forgot-password" className="btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                Request a new link
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="form-field">
                <label className="form-label">New password</label>
                <input
                  type="password"
                  className="form-input"
                  value={pw1}
                  onChange={(e) => setPw1(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="form-field">
                <label className="form-label">Confirm new password</label>
                <input
                  type="password"
                  className="form-input"
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  required
                />
              </div>
              {error && <div className="error-msg">{error}</div>}
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Saving…' : 'Set new password'}
              </button>
              <div className="login-alt">
                <Link to="/forgot-password">Link expired? Request a new one</Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
