import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { AuthGuard } from './components/AuthGuard'
import { NavBar } from './components/NavBar'
import { Login } from './pages/Login'
import { Evaluator } from './pages/Evaluator'
import { Deals } from './pages/Deals'
import { Leads } from './pages/Leads'
import { SalesCommand } from './pages/SalesCommand'
import { Admin } from './pages/Admin'

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavBar />
      {children}
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/evaluator"
            element={
              <AuthGuard tabKey="evaluator">
                <Layout>
                  <Evaluator />
                </Layout>
              </AuthGuard>
            }
          />

          <Route
            path="/deals"
            element={
              <AuthGuard tabKey="deals">
                <Layout>
                  <Deals />
                </Layout>
              </AuthGuard>
            }
          />

          <Route
            path="/leads"
            element={
              <AuthGuard tabKey="leads">
                <Layout>
                  <Leads />
                </Layout>
              </AuthGuard>
            }
          />

          <Route
            path="/sales-command"
            element={
              <AuthGuard tabKey="sales_command">
                <Layout>
                  <SalesCommand />
                </Layout>
              </AuthGuard>
            }
          />

          <Route
            path="/admin"
            element={
              <AuthGuard adminOnly>
                <Layout>
                  <Admin />
                </Layout>
              </AuthGuard>
            }
          />

          <Route path="/" element={<Navigate to="/evaluator" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
