import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { HeartPulse } from 'lucide-react'
import { AuthProvider, useAuth } from './lib/auth'
import { configured } from './lib/supabase'
import AppShell from './components/AppShell'
import { Spinner } from './components/ui'
import Landing from './pages/Landing'
import { LoginPage, ResetPasswordPage, SignupPage } from './pages/AuthPages'
import { AppointmentsPage, NotificationsPage, ProfilePage } from './pages/shared'
import { PatientHome, PatientMessages, PatientRecords } from './pages/patient/PatientPages'
import { NurseHome, NurseMessagesList, NurseThread, PatientDetail, PatientsList } from './pages/nurse/NursePages'
import InstallPrompt from './components/InstallPrompt'
import NotificationPermissionPrompt from './components/NotificationPermissionPrompt'
import AdminDashboard from './pages/admin/AdminPages'

function SetupNeeded() {
  return (
    <>
      <InstallPrompt />
      <NotificationPermissionPrompt />
      <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-6 py-10">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-600 text-white">
        <HeartPulse className="h-6 w-6" />
      </span>
      <h1 className="text-2xl font-bold">Almost there</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-300">CareConnect needs to be connected to your Supabase project. Add these two environment variables, then rebuild or redeploy:</p>
      <pre className="mt-4 overflow-x-auto rounded-xl bg-slate-900 p-4 text-sm text-teal-200">
        {`VITE_SUPABASE_URL\nVITE_SUPABASE_ANON_KEY`}
      </pre>
      <p className="mt-4 text-sm text-slate-500">You can find both in Supabase under Project Settings → API. See README.md for the full guide.</p>
      </div>
    </>
  )
}

function RequireAuth() {
  const { session, role, loading } = useAuth()
  if (loading) return <Spinner label="Opening CareConnect…" />
  if (!session) return <Navigate to="/login" replace />
  if (!role) return <Spinner label="Setting up your account…" />
  return <AppShell />
}

function RoleHome() {
  const { role } = useAuth()
  return role === 'admin' ? <AdminDashboard /> : role === 'nurse' ? <NurseHome /> : <PatientHome />
}

function RoleMessages() {
  const { role } = useAuth()
  return role === 'nurse' ? <NurseMessagesList /> : <PatientMessages />
}

function RoleThread() {
  const { role } = useAuth()
  return role === 'nurse' ? <NurseThread /> : <PatientMessages />
}

function NurseOnly({ children }: { children: React.ReactNode }) {
  const { role } = useAuth()
  return role === 'nurse' ? <>{children}</> : <Navigate to="/app" replace />
}

function PatientOnly({ children }: { children: React.ReactNode }) {
  const { role } = useAuth()
  return role === 'patient' ? <>{children}</> : <Navigate to="/app" replace />
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { role } = useAuth()
  return role === 'admin' ? <>{children}</> : <Navigate to="/app" replace />
}

export default function App() {
  if (!configured) return <SetupNeeded />
  return (
    <AuthProvider>
      <BrowserRouter>
        <InstallPrompt />
        <NotificationPermissionPrompt />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/app" element={<RequireAuth />}>
            <Route index element={<RoleHome />} />
            <Route path="messages" element={<RoleMessages />} />
            <Route path="messages/:peerId" element={<RoleThread />} />
            <Route path="appointments" element={<AppointmentsPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="records" element={<PatientOnly><PatientRecords /></PatientOnly>} />
            <Route path="patients" element={<NurseOnly><PatientsList /></NurseOnly>} />
            <Route path="patients/:id" element={<NurseOnly><PatientDetail /></NurseOnly>} />
            <Route path="admin" element={<AdminOnly><AdminDashboard /></AdminOnly>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
