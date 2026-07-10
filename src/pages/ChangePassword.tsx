import { type FormEvent, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function ChangePassword() {
  const { user, loading: authLoading, changePassword } = useAuth()
  const navigate = useNavigate()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  if (authLoading) return null
  if (!user) return <Navigate to="/login" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (next.length < 10) {
      setError('New password must be at least 10 characters')
      return
    }
    if (next !== confirm) {
      setError('New passwords do not match')
      return
    }
    setSaving(true)
    try {
      await changePassword(current, next)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password change failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-glow" />
      <div className="login-inner">
        <div className="login-logo-area">
          <div className="login-logo bebas">ASSET <span className="login-logo-gold">RE:SOURCE</span></div>
          <div className="login-sub">
            {user.must_change_password ? 'Set a new password to continue' : 'Change password'}
          </div>
        </div>
        <div className="login-card">
          <form onSubmit={handleSubmit}>
            <div className="form-field">
              <label className="form-label">Current password</label>
              <input
                type="password"
                className="form-input"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="form-field">
              <label className="form-label">New password (10+ characters)</label>
              <input
                type="password"
                className="form-input"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                required
              />
            </div>
            <div className="form-field">
              <label className="form-label">Confirm new password</label>
              <input
                type="password"
                className="form-input"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
            {error && <div className="error-msg">{error}</div>}
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
