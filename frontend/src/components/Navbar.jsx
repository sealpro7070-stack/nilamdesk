import { NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const ADMIN_EMAIL = 'm-10603978@moe-dl.edu.my'

export default function Navbar() {
  const navigate = useNavigate()
  const [isAdmin, setIsAdmin]   = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [userEmail, setUserEmail] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAdmin(session?.user?.email === ADMIN_EMAIL)
      setUserEmail(session?.user?.email || '')
    })
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  const linkClass = ({ isActive }) =>
    `text-sm font-semibold px-3.5 py-2 rounded-lg transition-all duration-150 ${
      isActive
        ? 'text-z-green bg-z-green/8'
        : 'text-z-fog hover:text-z-snow hover:bg-z-lift'
    }`

  return (
    <header className="bg-z-card/90 backdrop-blur-md border-b border-z-rim sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 h-14 sm:h-16 flex items-center justify-between">

        {/* Logo */}
        <NavLink to="/dashboard" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 bg-z-green rounded-lg flex items-center justify-center group-hover:bg-z-green-d transition-colors shadow-glow-g-sm">
            <BookIcon className="w-4 h-4 text-z-void" />
          </div>
          <span className="font-display font-bold text-z-snow tracking-tight">Nilam Auto</span>
        </NavLink>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-0.5">
          <NavLink to="/dashboard" className={linkClass}>Dashboard</NavLink>
          <NavLink to="/settings" className={linkClass}>Settings</NavLink>
          <NavLink to="/history" className={linkClass}>History</NavLink>
          {isAdmin && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `text-sm font-semibold px-3.5 py-2 rounded-lg transition-all ${
                  isActive ? 'text-z-blue bg-z-blue/10' : 'text-z-blue/70 hover:text-z-blue hover:bg-z-blue/8'
                }`
              }
            >
              Admin
            </NavLink>
          )}
          <div className="w-px h-4 bg-z-rim mx-2" />
          {/* Connected badge */}
          <div className="hidden md:flex items-center gap-1.5 bg-z-green/10 border border-z-green/25 px-3 py-1.5 rounded-full mr-2">
            <span className="w-1.5 h-1.5 bg-z-green rounded-full animate-pulse" />
            <span className="text-z-green text-xs font-bold font-mono">Connected</span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm font-semibold text-z-ash hover:text-z-red px-3.5 py-2 rounded-lg hover:bg-z-red/8 transition-all"
          >
            <LogoutIcon className="w-4 h-4" />
            Logout
          </button>
        </nav>

        {/* Mobile: hamburger */}
        <button
          onClick={() => setMenuOpen(v => !v)}
          className="sm:hidden p-2 rounded-lg hover:bg-z-lift transition-colors"
        >
          {menuOpen
            ? <XIcon className="w-5 h-5 text-z-fog" />
            : <MenuIcon className="w-5 h-5 text-z-fog" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="sm:hidden border-t border-z-rim bg-z-card px-3 py-2 space-y-0.5">
          {/* Email */}
          {userEmail && (
            <div className="px-4 py-2 mb-1">
              <p className="text-xs text-z-ash font-mono truncate">{userEmail}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-1.5 h-1.5 bg-z-green rounded-full animate-pulse" />
                <span className="text-z-green text-xs font-bold">Connected</span>
              </div>
            </div>
          )}
          {[
            { to: '/dashboard', label: 'Dashboard' },
            { to: '/settings',  label: 'Settings' },
            { to: '/history',   label: 'History' },
          ].map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center text-sm font-semibold px-4 py-3 rounded-xl transition-all ${
                  isActive ? 'bg-z-green/10 text-z-green' : 'text-z-fog hover:bg-z-lift hover:text-z-snow'
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
                  isActive ? 'bg-z-blue/10 text-z-blue' : 'text-z-blue/70 hover:bg-z-lift hover:text-z-blue'
                }`
              }
            >
              Admin
            </NavLink>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 text-sm font-semibold text-z-ash hover:text-z-red px-4 py-3 rounded-xl hover:bg-z-red/8 transition-all"
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
