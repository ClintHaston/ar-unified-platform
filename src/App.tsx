import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { AuthGuard } from './components/AuthGuard'
import { AppShell } from './components/shell/AppShell'
import { Login } from './pages/Login'
import { ForgotPassword } from './pages/ForgotPassword'
import { ResetPassword } from './pages/ResetPassword'
import { ChangePassword } from './pages/ChangePassword'
import { Dashboard } from './pages/Dashboard'
import { Pipelines } from './pages/Pipelines'
import { BuyerOpportunities } from './pages/BuyerOpportunities'
import { BuyerOpportunityDetail } from './pages/BuyerOpportunityDetail'
import { DealDetail } from './pages/DealDetail'
import { Inventory } from './pages/Inventory'
import { UnitDetail } from './pages/UnitDetail'
import { Contacts } from './pages/Contacts'
import { ContactDetail } from './pages/ContactDetail'
import { Lists } from './pages/Lists'
import { SegmentDetail } from './pages/SegmentDetail'
import { SalesSheet } from './pages/SalesSheet'
import { IntakeWizard } from './pages/IntakeWizard'
import { CommissionReport } from './pages/CommissionReport'
import { Evaluator } from './pages/Evaluator'
import { Deals } from './pages/Deals'
import { Leads } from './pages/Leads'
import { SalesCommand } from './pages/SalesCommand'
import { Admin } from './pages/Admin'
import { Spine } from './pages/Spine'
import { Outbox } from './pages/Outbox'
import { LeadApprovals } from './pages/LeadApprovals'
import { Tasks } from './pages/Tasks'
import { Reports } from './pages/Reports'
import { DashboardView } from './pages/DashboardView'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/change-password" element={<AuthGuard><ChangePassword /></AuthGuard>} />

          {/* App shell: grouped sidebar + flyouts, Ctrl+K command bar, quick-add,
              activity rail, breadcrumbs. Preview banner (Amendment 14) preserved. */}
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<AuthGuard><Dashboard /></AuthGuard>} />
            <Route path="/tasks" element={<AuthGuard><Tasks /></AuthGuard>} />
            <Route path="/reports" element={<AuthGuard><Reports /></AuthGuard>} />
            <Route path="/dashboards/:dashboardId" element={<AuthGuard adminOnly><DashboardView /></AuthGuard>} />
            <Route path="/pipelines" element={<AuthGuard><Pipelines /></AuthGuard>} />
            <Route path="/buyer-opportunities" element={<AuthGuard><BuyerOpportunities /></AuthGuard>} />
            <Route path="/buyer-opportunities/:opportunityId" element={<AuthGuard><BuyerOpportunityDetail /></AuthGuard>} />
            <Route path="/deals/:dealId" element={<AuthGuard><DealDetail /></AuthGuard>} />
            <Route path="/inventory" element={<AuthGuard><Inventory /></AuthGuard>} />
            <Route path="/inventory/intake" element={<AuthGuard><IntakeWizard /></AuthGuard>} />
            <Route path="/units/:unitId" element={<AuthGuard><UnitDetail /></AuthGuard>} />
            <Route path="/contacts" element={<AuthGuard><Contacts /></AuthGuard>} />
            <Route path="/contacts/:contactId" element={<AuthGuard><ContactDetail /></AuthGuard>} />
            <Route path="/lists" element={<AuthGuard><Lists /></AuthGuard>} />
            <Route path="/lists/:segmentId" element={<AuthGuard><SegmentDetail /></AuthGuard>} />
            <Route path="/sales-sheet" element={<AuthGuard><SalesSheet /></AuthGuard>} />
            <Route path="/commission" element={<AuthGuard adminOnly><CommissionReport /></AuthGuard>} />

            <Route path="/evaluator" element={<AuthGuard><Evaluator /></AuthGuard>} />
            <Route path="/deals-legacy" element={<AuthGuard><Deals /></AuthGuard>} />
            <Route path="/leads" element={<AuthGuard><Leads /></AuthGuard>} />
            <Route path="/sales-command" element={<AuthGuard><SalesCommand /></AuthGuard>} />

            <Route path="/admin" element={<AuthGuard adminOnly><Admin /></AuthGuard>} />
            <Route path="/outbox" element={<AuthGuard adminOnly><Outbox /></AuthGuard>} />
            <Route path="/lead-approvals" element={<AuthGuard adminOnly><LeadApprovals /></AuthGuard>} />
            <Route path="/spine" element={<AuthGuard adminOnly><Spine /></AuthGuard>} />
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
