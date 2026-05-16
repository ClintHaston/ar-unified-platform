import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { AuthGuard } from './components/AuthGuard'
import { NavBar } from './components/NavBar'
import { PersistentIframes } from './components/PersistentIframes'
import { Login } from './pages/Login'
import { Evaluator } from './pages/Evaluator'
import { Deals } from './pages/Deals'
import { Leads } from './pages/Leads'
import { SalesCommand } from './pages/SalesCommand'
import { Admin } from './pages/Admin'

function Layout() {
  return (
    <>
      <NavBar />
      <PersistentIframes />
      <Outlet />
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* Single persistent layout — NavBar mounts once, Outlet swaps content */}
          <Route element={<Layout />}>
            <Route
              path="/evaluator"
              element={<AuthGuard tabKey="evaluator"><Evaluator /></AuthGuard>}
            />
            <Route
              path="/deals"
              element={<AuthGuard tabKey="deals"><Deals /></AuthGuard>}
            />
            <Route
              path="/leads"
              element={<AuthGuard tabKey="leads"><Leads /></AuthGuard>}
            />
            <Route
              path="/sales-command"
              element={<AuthGuard tabKey="sales_command"><SalesCommand /></AuthGuard>}
            />
            <Route
              path="/admin"
              element={<AuthGuard adminOnly><Admin /></AuthGuard>}
            />
          </Route>

          <Route path="/" element={<Navigate to="/evaluator" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
