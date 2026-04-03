import { NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Use env var to avoid exposing PII in the public JS bundle
const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAIL || '').split(',').map(e => e.trim()).filter(Boolean)

export default function Navbar() {
  const navigate = useNavigate()
  const [isAdmin, setIsAdmin]   = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [userEmail, setUserEmail] = useState('')

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAdmin(ADMIN_EMAILS.includes(session?.user?.email || ''))
      setUserEmail(session?.user?.email || '')
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  const linkClass = ({ isActive }) =>
    `text-sm font-semibold px-3.5 py-2 rounded-lg transition-all duration-150 ${
      isActive
        ? 'text-brand-600 bg-brand-50'
        : 'text-muted hover:text-heading hover:bg-gray-50'
    }`

  return (
    <header className="bg-white border-b border-line sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 h-14 sm:h-16 flex items-center justify-between">

        {/* Logo */}
        <NavLink to="/dashboard" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center group-hover:bg-brand-700 transition-colors">
            <BookIcon className="w-4 h-4 text-white" />
          </div>
          <span className="font-display font-bold text-heading tracking-tight">Nilam Auto</span>
        </NavLink>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-0.5">
          <NavLink to="/dashboard" className={linkClass}>Dashboard</NavLink>
          <NavLink to="/guide" className={linkClass}>Setup Guide</NavLink>
          <NavLink to="/settings" className={linkClass}>Settings</NavLink>
          <NavLink to="/history" className={linkClass}>History</NavLink>
          <NavLink to="/upgrade" className={({ isActive }) =>
            `text-sm font-semibold px-3.5 py-2 rounded-lg transition-all duration-150 ${
              isActive ? 'text-brand-600 bg-brand-50' : 'text-brand-600 hover:bg-brand-50'
            }`
          }>Upgrade</NavLink>
          {isAdmin && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `text-sm font-semibold px-3.5 py-2 rounded-lg transition-all ${
                  isActive ? 'text-brand-600 bg-brand-50' : 'text-muted hover:text-brand-600 hover:bg-brand-50'
                }`
              }
            >
              Admin
            </NavLink>
          )}
          <div className="w-px h-4 bg-line mx-2" />
          <div className="hidden md:flex items-center gap-1.5 bg-ok-50 border border-ok-200 px-3 py-1.5 rounded-full mr-2">
            <span className="w-1.5 h-1.5 bg-ok-500 rounded-full animate-pulse" />
            <span className="text-ok-600 text-xs font-bold">Logged In</span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-danger-600 px-3.5 py-2 rounded-lg hover:bg-danger-50 transition-all"
          >
            <LogoutIcon className="w-4 h-4" />
            Logout
          </button>
        </nav>

        {/* Mobile: hamburger */}
        <button
          onClick={() => setMenuOpen(v => !v)}
          className="sm:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          {menuOpen
            ? <XIcon className="w-5 h-5 text-muted" />
            : <MenuIcon className="w-5 h-5 text-muted" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="sm:hidden border-t border-line bg-white px-3 py-2 space-y-0.5">
          {userEmail && (
            <div className="px-4 py-2 mb-1">
              <p className="text-xs text-subtle font-mono truncate">{userEmail}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-1.5 h-1.5 bg-ok-500 rounded-full animate-pulse" />
                <span className="text-ok-600 text-xs font-bold">Logged In</span>
              </div>
            </div>
          )}
          {[
            { to: '/dashboard', label: 'Dashboard' },
            { to: '/guide',     label: 'Setup Guide' },
            { to: '/settings',  label: 'Settings' },
            { to: '/history',   label: 'History' },
            { to: '/upgrade',   label: 'Upgrade' },
          ].map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center text-sm font-semibold px-4 py-3 rounded-xl transition-all ${
                  isActive ? 'bg-brand-50 text-brand-600' : 'text-muted hover:bg-gray-50 hover:text-heading'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
          {isAdmin && (
            <NavLink
              to="/admin"
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center text-sm font-semibold px-4 py-3 rounded-xl transition-all ${
                  isActive ? 'bg-brand-50 text-brand-600' : 'text-muted hover:bg-gray-50 hover:text-brand-600'
                }`
              }
            >
              Admin
            </NavLink>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 text-sm font-semibold text-muted hover:text-danger-600 px-4 py-3 rounded-xl hover:bg-danger-50 transition-all"
          >
            <LogoutIcon className="w-4 h-4" />
            Logout
          </button>
        </div>
      )}
    </header>
  )
}

function BookIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}
function MenuIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
}
function XIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
}
function LogoutIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
}
