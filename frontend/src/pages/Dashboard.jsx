import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Capacitor } from '@capacitor/core'
import { supabase } from '../lib/supabase'
import BookCard from '../components/BookCard'

const BACKEND   = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
const LANGUAGES = ['Malay', 'English', 'Chinese', 'Tamil']
const LANG_MAP  = { Malay: 'Melayu', English: 'Inggeris', Chinese: 'Cina', Tamil: 'Tamil' }

const isNative = Capacitor.isNativePlatform()

export default function Dashboard() {
  const navigate = useNavigate()
  const [user, setUser]             = useState(null)
  const [settings, setSettings]     = useState(null)
  const [stats, setStats]           = useState({ total: 0, successful: 0, thisMonth: 0 })
  const [recent, setRecent]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [lang, setLang]             = useState('Malay')
  const [bookCount, setBookCount]   = useState(4)
  const [triggering, setTriggering] = useState(false)
  const [triggerMsg, setTriggerMsg] = useState('')
  const [isError, setIsError]       = useState(false)
  const [cookieStatus, setCookieStatus] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setLoading(false); return }
        setUser(user)

        const [sRes, stRes, rRes] = await Promise.allSettled([
          fetch(`${BACKEND}/api/settings?userId=${user.id}`),
          fetch(`${BACKEND}/api/history/stats?userId=${user.id}`),
          fetch(`${BACKEND}/api/history?userId=${user.id}&limit=5`),
        ])

        if (sRes.status === 'fulfilled' && sRes.value.ok) {
          const s = await sRes.value.json()
          setSettings(s)
          const displayLang = Object.entries(LANG_MAP).find(([, v]) => v === s.language)?.[0] || 'Malay'
          setLang(displayLang)
          setBookCount(s.books_per_month || 4)
        }
        if (stRes.status === 'fulfilled' && stRes.value.ok) setStats(await stRes.value.json())
        if (rRes.status === 'fulfilled' && rRes.value.ok) {
          const d = await rRes.value.json()
          setRecent(d.submissions || [])
        }

        // Check AINS session status for all users
        const { data: ud } = await supabase
          .from('users').select('cookie_updated_at').eq('id', user.id).single()
        if (ud?.cookie_updated_at) {
          const age = Date.now() - new Date(ud.cookie_updated_at).getTime()
          setCookieStatus(age < 7 * 24 * 60 * 60 * 1000 ? 'fresh' : 'stale')
        } else {
          setCookieStatus('none')
        }
      } catch {
        // Supabase unreachable — still show the dashboard
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleSubmit() {
    if (!user) return
    if (cookieStatus !== 'fresh') {
      setTriggerMsg(isNative
        ? 'Connect your AINS account in Settings first.'
        : 'Save your AINS session via the Chrome extension first.')
      setIsError(true)
      return
    }
    setTriggering(true)
    setTriggerMsg('')
    setIsError(false)
    try {
      const apiLang = LANG_MAP[lang] || lang
      await fetch(`${BACKEND}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, language: apiLang, books_per_month: bookCount }),
      })
      const res  = await fetch(`${BACKEND}/api/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, count: bookCount }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to start')
      setTriggerMsg(data.message || 'Bot started! Check back in a few minutes.')
      setSettings(s => ({ ...s, language: apiLang, books_per_month: bookCount }))
    } catch (err) {
      setTriggerMsg(err.message)
      setIsError(true)
    } finally {
      setTriggering(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-line border-t-brand-600 rounded-full animate-spin" />
        <p className="text-muted text-sm">Loading dashboard…</p>
      </div>
    </div>
  )

  const displayName = user?.email?.split('@')[0] || 'there'
  const hour        = new Date().getHours()
  const greeting    = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const nextRun     = settings?.auto_schedule
    ? `Day ${settings.schedule_day} of next month`
    : 'No schedule set'
  const pct = bookCount > 0 ? Math.min((stats.thisMonth / bookCount) * 100, 100) : 0

  return (
    <div className="space-y-5">

      {/* ── AINS session warning (mobile) ───────────── */}
      {cookieStatus !== 'fresh' && cookieStatus !== null && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className={`rounded-2xl p-4 flex items-start gap-3 border ${
            cookieStatus === 'stale'
              ? 'bg-warn-50 border-warn-200'
              : 'bg-danger-50 border-danger-200'
          }`}
        >
          <span className={`text-xl flex-shrink-0 ${cookieStatus === 'stale' ? 'text-warn-500' : 'text-danger-500'}`}>
            {cookieStatus === 'stale' ? '⚠️' : '🔒'}
          </span>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-bold ${cookieStatus === 'stale' ? 'text-warn-800' : 'text-danger-800'}`}>
              {cookieStatus === 'stale' ? 'AINS Session May Have Expired' : 'AINS Account Not Connected'}
            </p>
            <p className={`text-xs mt-0.5 ${cookieStatus === 'stale' ? 'text-warn-700' : 'text-danger-700'}`}>
              {cookieStatus === 'stale'
                ? 'Your session may be too old. Reconnect before submitting.'
                : 'You need to log in to AINS before submitting records.'}
            </p>
          </div>
          <button
            onClick={() => navigate('/settings')}
            className={`flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
              cookieStatus === 'stale'
                ? 'bg-warn-200 text-warn-800 hover:bg-warn-300'
                : 'bg-danger-200 text-danger-800 hover:bg-danger-300'
            }`}
          >
            Connect →
          </button>
        </motion.div>
      )}

      {/* ── Welcome banner ─────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="bg-brand-600 rounded-card p-6 text-white relative overflow-hidden"
      >
        <div className="absolute -right-10 -top-10 w-48 h-48 bg-white/5 rounded-full pointer-events-none" />
        <div className="absolute -right-2 -bottom-8 w-32 h-32 bg-white/5 rounded-full pointer-events-none" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="text-brand-200 text-sm font-semibold mb-0.5">{greeting},</p>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold truncate">{displayName}</h1>
            <p className="text-brand-100 text-sm mt-2">
              {stats.thisMonth > 0
                ? `${stats.thisMonth} record${stats.thisMonth !== 1 ? 's' : ''} submitted this month. Great work!`
                : 'No records submitted this month yet.'}
            </p>
          </div>
          <div className="flex items-center gap-1.5 bg-white/15 px-3 py-1.5 rounded-full flex-shrink-0">
            <span className="w-1.5 h-1.5 bg-ok-400 rounded-full animate-pulse" />
            <span className="text-white text-xs font-bold">Connected</span>
          </div>
        </div>

        {/* Horizontal progress bar */}
        <div className="relative mt-5">
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-brand-200 font-semibold">This Month's Progress</span>
            <span className="text-white font-bold">{stats.thisMonth} / {bookCount} books</span>
          </div>
          <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
              className="h-full bg-white rounded-full"
            />
          </div>
        </div>
      </motion.div>

      {/* ── Stats row ──────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total Submitted', value: stats.successful, icon: BookIcon },
          { label: 'Language', value: settings?.language ?? '—', icon: GlobeIcon },
          { label: 'Next Run', value: nextRun, icon: ClockIcon, highlight: settings?.auto_schedule },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.05 + i * 0.04 }}
            className={`card-p flex items-center gap-4 ${s.highlight ? 'border-l-4 border-l-brand-400' : ''}`}
          >
            <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <s.icon className="w-5 h-5 text-brand-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-muted uppercase tracking-wide mb-0.5">{s.label}</p>
              <p className="font-display font-bold text-heading truncate">{s.value}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── Quick submit ───────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.12 }}
        className="card-p border-l-4 border-l-brand-600"
      >
        <h2 className="font-display text-lg font-bold text-heading mb-5 flex items-center gap-2">
          <span className="w-8 h-8 bg-brand-50 rounded-lg flex items-center justify-center">
            <BoltIcon className="w-4 h-4 text-brand-600" />
          </span>
          Submit Now
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
          {/* Language pills */}
          <div>
            <label className="label">Language</label>
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map(l => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`px-3.5 py-2 rounded-xl text-sm font-bold border transition-all duration-150 ${
                    lang === l
                      ? 'bg-brand-600 text-white border-brand-600 shadow-sm scale-105'
                      : 'bg-white text-muted border-line hover:border-brand-300 hover:text-brand-600'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Book count stepper */}
          <div>
            <label className="label">Number of Books</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setBookCount(v => Math.max(1, v - 1))}
                disabled={bookCount <= 1}
                className="w-10 h-10 rounded-xl bg-white border border-line text-heading text-xl font-bold hover:border-brand-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                −
              </button>
              <div className="flex-1 text-center">
                <span className="font-display text-3xl font-extrabold text-brand-600">{bookCount}</span>
                <p className="text-xs text-muted mt-0.5">books / month</p>
              </div>
              <button
                type="button"
                onClick={() => setBookCount(v => Math.min(8, v + 1))}
                disabled={bookCount >= 8}
                className="w-10 h-10 rounded-xl bg-white border border-line text-heading text-xl font-bold hover:border-brand-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                +
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={handleSubmit}
            disabled={triggering}
            className="btn-primary px-8 py-3"
          >
            {triggering ? (
              <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Submitting…</>
            ) : (
              <><BoltIcon className="w-4 h-4" />Submit {bookCount} {lang} Book{bookCount !== 1 ? 's' : ''}</>
            )}
          </button>
          {triggerMsg && (
            <span className={`text-sm font-bold flex items-center gap-1.5 ${isError ? 'text-danger-600' : 'text-ok-600'}`}>
              {isError
                ? <XCircleIcon className="w-4 h-4" />
                : <CheckCircleIcon className="w-4 h-4" />
              }
              {triggerMsg}
            </span>
          )}
        </div>

        <p className="text-xs text-subtle mt-3">
          Make sure your Chrome extension session is saved before submitting.
        </p>
      </motion.div>

      {/* ── Recent submissions ─────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.16 }}
        className="card-p"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-bold text-heading">Recent Submissions</h2>
          <button onClick={() => navigate('/history')} className="text-xs font-bold text-muted hover:text-brand-600 transition-colors">
            View all →
          </button>
        </div>

        {recent.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-12 h-12 bg-brand-50 border border-brand-100 rounded-2xl flex items-center justify-center">
              <BookIcon className="w-6 h-6 text-brand-400" />
            </div>
            <p className="text-muted text-sm font-semibold">No submissions yet</p>
            <p className="text-subtle text-xs">Press "Submit Now" to get started.</p>
          </div>
        ) : (
          recent.map(s => <BookCard key={s.id} submission={s} />)
        )}
      </motion.div>

    </div>
  )
}

function BookIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
}
function GlobeIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
}
function ClockIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
}
function BoltIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
}
function CheckCircleIcon({ className }) {
  return <svg className={className} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
}
function XCircleIcon({ className }) {
  return <svg className={className} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/></svg>
}
