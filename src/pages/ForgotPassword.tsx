import { type FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'

// §2 password reset, step 1 (build step 3c-6). The response is identical
// whether or not the email exists — no account enumeration.

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.requestPasswordReset(email.trim())
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
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
          <div className="login-sub">Reset your password</div>
        </div>
        <div className="login-card">
          {sent ? (
            <div>
              <p className="reset-note">
                If an account exists for <b>{email.trim()}</b>, a reset link is on its way.
                It works once and expires in 60 minutes.
              </p>
              <Link to="/login" className="btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="form-field">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  className="form-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              {error && <div className="error-msg">{error}</div>}
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
              <div className="login-alt">
                <Link to="/login">Back to sign in</Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
