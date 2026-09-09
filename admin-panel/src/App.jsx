import React, { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import 'remixicon/fonts/remixicon.css'

const AdminLogin = lazy(() => import('./pages/AdminLogin'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const AdminProtectWrapper = lazy(() => import('./pages/AdminProtectWrapper'))

/**
 * Web-only admin console. All UI lives under `/admin` (see README / deploy docs).
 */
const App = () => {
  return (
    <div className="min-h-dvh min-h-screen bg-white text-black text-slate-900">
      <Suspense fallback={<div className="h-screen flex items-center justify-center text-neutral-600 text-sm bg-white">Loading admin…</div>}>
        <Routes>
          <Route path="/" element={<Navigate to="/admin" replace />} />
          <Route path="/admin" element={<AdminLogin />} />
          <Route
            path="/admin/dashboard"
            element={(
              <AdminProtectWrapper>
                <AdminDashboard />
              </AdminProtectWrapper>
            )}
          />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </Suspense>
    </div>
  )
}

export default App
