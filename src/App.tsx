import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { AuthGuard } from './components/AuthGuard'
import { PlatformShell } from './components/PlatformShell'
import { Login } from './pages/Login'
import { ForgotPassword } from './pages/ForgotPassword'
import { ResetPassword } from './pages/ResetPassword'
import { ChangePassword } from './pages/ChangePassword'
import { Dashboard } from './pages/Dashboard'
import { Pipelines } from './pages/Pipelines'
import { DealDetail } from './pages/DealDetail'
import { Inventory } from './pages/Inventory'
import { UnitDetail } from './pages/UnitDetail'
import { Contacts } from './pages/Contacts'
import { ContactDetail } from './pages/ContactDetail'
import { Evaluator } from './pages/Evaluator'
import { Deals } from './pages/Deals'
import { Leads } from './pages/Leads'
import { SalesCommand } from './pages/SalesCommand'
import { Admin } from './pages/Admin'
import { Spine } from './pages/Spine'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/change-password" element={<AuthGuard><ChangePassword /></AuthGuard>} />

          {/* Prototype shell: brand + topbar + sidebar, preview banner (Amendment 14) */}
          <Route element={<PlatformShell />}>
            <Route path="/dashboard" element={<AuthGuard><Dashboard /></AuthGuard>} />
            <Route path="/pipelines" element={<AuthGuard><Pipelines /></AuthGuard>} />
            <Route path="/deals/:dealId" element={<AuthGuard><DealDetail /></AuthGuard>} />
            <Route path="/inventory" element={<AuthGuard><Inventory /></AuthGuard>} />
            <Route path="/units/:unitId" element={<AuthGuard><UnitDetail /></AuthGuard>} />
            <Route path="/contacts" element={<AuthGuard><Contacts /></AuthGuard>} />
            <Route path="/contacts/:contactId" element={<AuthGuard><ContactDetail /></AuthGuard>} />

            <Route path="/evaluator" element={<AuthGuard><Evaluator /></AuthGuard>} />
            <Route path="/deals-legacy" element={<AuthGuard><Deals /></AuthGuard>} />
            <Route path="/leads" element={<AuthGuard><Leads /></AuthGuard>} />
            <Route path="/sales-command" element={<AuthGuard><SalesCommand /></AuthGuard>} />

            <Route path="/admin" element={<AuthGuard adminOnly><Admin /></AuthGuard>} />
            <Route path="/spine" element={<AuthGuard adminOnly><Spine /></AuthGuard>} />
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
