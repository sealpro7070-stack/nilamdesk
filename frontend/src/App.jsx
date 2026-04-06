import { Routes, Route, Navigate, NavLink, Link } from 'react-router-dom'
import Landing  from './pages/Landing'
import Dashboard from './pages/Dashboard'
import Settings  from './pages/Settings'
import History   from './pages/History'
import Admin     from './pages/Admin'
import Upgrade   from './pages/Upgrade'
import Guide     from './pages/Guide'
import Privacy   from './pages/Privacy'
import Terms     from './pages/Terms'
import Navbar    from './components/Navbar'

function App() {
  return (
    <Routes>
      <Route path="/"         element={<Landing />} />
      <Route path="/upgrade"  element={<Upgrade />} />
      <Route path="/admin"    element={<Admin />} />
      <Route path="/dashboard" element={<AppLayout><Dashboard /></AppLayout>} />
      <Route path="/settings"  element={<AppLayout><Settings /></AppLayout>} />
      <Route path="/history"   element={<AppLayout><History /></AppLayout>} />
      <Route path="/guide"     element={<AppLayout><Guide /></AppLayout>} />
      <Route path="/privacy"   element={<Privacy />} />
      <Route path="/terms"     element={<Terms />} />
      <Route path="*"          element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function AppLayout({ children }) {
  return (
    <div className="min-h-screen bg-page">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-5 pb-28 sm:pb-8">{children}</main>
      <footer className="hidden sm:block border-t border-line py-4">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-center gap-4">
          <Link to="/terms" className="text-xs text-subtle hover:text-muted transition-colors">Terms of Use</Link>
          <span className="text-subtle text-xs">·</span>
          <Link to="/privacy" className="text-xs text-subtle hover:text-muted transition-colors">Privacy Policy</Link>
        </div>
      </footer>
      <BottomNav />
    </div>
  )
}

function BottomNav() {
  const tabClass = ({ isActive }) =>
    `flex flex-col items-center gap-0.5 px-5 py-2 rounded-2xl transition-all duration-150 ${
      isActive ? 'text-brand-600 bg-brand-50' : 'text-subtle'
    }`

  return (
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-line z-50 bottom-nav-safe">
      <div className="flex justify-around items-center px-3 pt-2 pb-1">
        <NavLink to="/dashboard" className={tabClass}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          <span className="text-xs font-bold">Home</span>
        </NavLink>

        <NavLink to="/settings" className={tabClass}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-xs font-bold">Settings</span>
        </NavLink>

        <NavLink to="/history" className={tabClass}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span className="text-xs font-bold">History</span>
        </NavLink>

        <NavLink to="/guide" className={tabClass}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <span className="text-xs font-bold">Guide</span>
        </NavLink>
      </div>
    </nav>
  )
}

export default App
