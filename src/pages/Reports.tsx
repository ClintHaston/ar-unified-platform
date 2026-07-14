import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Icon } from '../components/shell/icons'

// Reports hub — a clean placeholder surface (never a dead link). The commission
// report already exists for admins and is linked here; a broader reporting
// workstream lands later.

export function Reports() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  return (
    <div className="ws-placeholder">
      <div className="ws-ph-ic"><Icon name="reports" size={26} /></div>
      <h2>Reporting is on the way</h2>
      <p>
        Saved dashboards and cross-object reports arrive in a later workstream.
        {isAdmin
          ? ' In the meantime, the commission report is ready.'
          : ' Ask an admin for the commission report until then.'}
      </p>
      {isAdmin && (
        <div style={{ marginTop: 18 }}>
          <Link to="/commission" className="plat-btn" style={{ display: 'inline-block', textDecoration: 'none' }}>
            Open commission report
          </Link>
        </div>
      )}
    </div>
  )
}
