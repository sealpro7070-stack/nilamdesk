import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import BookCard from '../components/BookCard'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
const LANGUAGES   = ['Melayu', 'Inggeris', 'Cina', 'Tamil']
const BOOK_COUNTS = [1, 2, 3, 4]

/* ── Circular SVG progress ─────────────────────────── */
function CircularProgress({ value, max, size = 136 }) {
  const r    = 52
  const circ = 2 * Math.PI * r
  const pct  = max > 0 ? Math.min(value / max, 1) : 0
  const off  = circ * (1 - pct)

  return (
    <svg width={size} height={size} className="-rotate-90">
      {/* Track */}
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#2A2A38" strokeWidth="10" />
      {/* Progress */}
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke="#00FF85"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={off}
        style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)', filter: 'drop-shadow(0 0 8px rgba(0,255,133,0.6))' }}
      />
    </svg>
  )
}

/* ── Main ──────────────────────────────────────────── */
export default function Dashboard() {
  const navigate = useNavigate()
  const [user, setUser]             = useState(null)
  const [settings, setSettings]     = useState(null)
  const [stats, setStats]           = useState({ total: 0, successful: 0, thisMonth: 0 })
  const [recent, setRecent]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [lang, setLang]             = useState('Melayu')
  const [bookCount, setBookCount]   = useState(4)
  const [triggering, setTriggering] = useState(false)
  const [triggerMsg, setTriggerMsg] = useState('')
  const [isError, setIsError]       = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUser(user)

      const [sRes, stRes, rRes] = await Promise.all([
        fetch(`${BACKEND}/api/settings?userId=${user.id}`),
        fetch(`${BACKEND}/api/history/stats?userId=${user.id}`),
        fetch(`${BACKEND}/api/history?userId=${user.id}&limit=5`),
      ])

      if (sRes.ok) {
        const s = await sRes.json()
        setSettings(s)
        setLang(s.language || 'Melayu')
        setBookCount(s.books_per_month || 4)
      }
      if (stRes.ok) setStats(await stRes.json())
      if (rRes.ok) {
        const d = await rRes.json()
        setRecent(d.submissions || [])
      }
      setLoading(false)
    }
    load()
  }, [])

  async function handleSubmit() {
    if (!user) return
    setTriggering(true)
    setTriggerMsg('')
    setIsError(false)
    try {
      await fetch(`${BACKEND}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, language: lang, books_per_month: bookCount }),
      })
      const res  = await fetch(`${BACKEND}/api/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, count: bookCount }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to start')
      setTriggerMsg(data.message || 'Bot started! Check back in a few minutes.')
      setSettings(s => ({ ...s, language: lang, books_per_month: bookCount }))
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
        <div className="w-10 h-10 border-2 border-z-rim border-t-z-green rounded-full animate-spin" />
        <p className="text-z-fog text-sm font-mono">Loading dashboard…</p>
      </div>
    </div>
  )

  const displayName = user?.email?.split('@')[0] || 'there'
  const hour        = new Date().getHours()
  const greeting    = hour < 12 ? 'Selamat pagi' : hour < 17 ? 'Selamat petang' : 'Selamat malam'
  const nextRun     = settings?.auto_schedule
    ? `Hari ${settings.schedule_day} bulan depan`
    : 'Tiada jadual'

  return (
    <div className="space-y-5">

      {/* ── Welcome banner ─────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="relative overflow-hidden card-glow"
      >
        {/* Background glow */}
        <div className="absolute -right-12 -top-12 w-48 h-48 bg-z-green/8 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="text-z-fog text-sm font-semibold mb-0.5">{greeting},</p>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-z-snow truncate">{displayName}</h1>
            <p className="text-z-fog text-sm mt-2">
              {stats.thisMonth > 0
                ? `${stats.thisMonth} rekod dihantar bulan ini. Tahniah!`
                : 'Tiada rekod dihantar bulan ini lagi.'}
            </p>
          </div>
          <div className="flex items-center gap-1.5 bg-z-green/10 border border-z-green/30 px-3 py-1.5 rounded-full flex-shrink-0">
            <span className="w-1.5 h-1.5 bg-z-green rounded-full animate-pulse" />
            <span className="text-z-green text-xs font-bold font-mono">Connected</span>
          </div>
        </div>
      </motion.div>

      {/* ── Hero stat + next run ────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Circular progress card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="card flex flex-col items-center py-8 gap-4 relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-z-green/3 pointer-events-none" />
          <p className="text-xs font-bold text-z-fog uppercase tracking-widest font-mono">Bulan Ini</p>
          <div className="relative">
            <CircularProgress value={stats.thisMonth} max={bookCount} />
            {/* Center text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-3xl font-extrabold text-z-snow">{stats.thisMonth}</span>
              <span className="text-xs text-z-fog font-semibold">/ {bookCount}</span>
            </div>
          </div>
          <div className="text-center">
            <p className="text-z-snow font-bold text-sm">Rekod Dihantar</p>
            <p className="text-z-fog text-xs mt-0.5">
              {stats.thisMonth === 0 ? 'Belum ada penyerahan' : `${stats.thisMonth} daripada ${bookCount} buku`}
            </p>
          </div>
        </motion.div>

        {/* Stats column */}
        <motion.div
          initial={{ opacity: 0, x: 14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, delay: 0.08 }}
          className="space-y-3"
        >
          <MiniStat icon="📚" label="Jumlah Hantar" value={stats.successful} sub="sepanjang masa" />
          <MiniStat icon="🌐" label="Bahasa" value={settings?.language ?? '—'} sub="sedang ditetapkan" />
          <MiniStat
            icon="⏰"
            label="Larian Seterusnya"
            value={nextRun}
            sub={settings?.auto_schedule ? 'auto-jadual aktif' : 'manual sahaja'}
            highlight={settings?.auto_schedule}
          />
        </motion.div>
      </div>

      {/* ── Quick submit ───────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.12 }}
        className="card border-z-green/15 relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-z-green/2 pointer-events-none" />
        <div className="relative">
          <h2 className="font-display text-lg font-bold text-z-snow mb-5 flex items-center gap-2">
            <span className="w-8 h-8 bg-z-green/10 border border-z-green/25 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-z-green" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </span>
            Hantar Sekarang
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
            {/* Language */}
            <div>
              <label className="label">Bahasa</label>
              <div className="flex flex-wrap gap-2">
                {LANGUAGES.map(l => (
                  <button
                    key={l}
                    onClick={() => setLang(l)}
                    className={`px-3.5 py-2 rounded-xl text-sm font-bold border transition-all duration-150 ${
                      lang === l
                        ? 'bg-z-green text-z-void border-z-green shadow-glow-g-sm scale-105'
                        : 'bg-z-lift text-z-fog border-z-rim hover:border-z-green/40 hover:text-z-green'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Book count */}
            <div>
              <label className="label">Bilangan Buku</label>
              <div className="flex gap-2">
                {BOOK_COUNTS.map(n => (
                  <button
                    key={n}
                    onClick={() => setBookCount(n)}
                    className={`w-12 h-12 rounded-xl text-sm font-bold border transition-all duration-150 ${
                      bookCount === n
                        ? 'bg-z-green text-z-void border-z-green shadow-glow-g-sm scale-105'
                        : 'bg-z-lift text-z-fog border-z-rim hover:border-z-green/40 hover:text-z-green'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <button
              onClick={handleSubmit}
              disabled={triggering}
              className="btn-primary text-base px-8 py-3.5"
            >
              {triggering ? (
                <><span className="w-4 h-4 border-2 border-z-void/30 border-t-z-void rounded-full animate-spin" />Hantar…</>
              ) : (
                <><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>Hantar {bookCount} Buku {lang}</>
              )}
            </button>
            {triggerMsg && (
              <span className={`text-sm font-bold flex items-center gap-1.5 ${isError ? 'text-z-red' : 'text-z-green'}`}>
                {isError
                  ? <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                  : <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                }
                {triggerMsg}
              </span>
            )}
          </div>

          <p className="text-xs text-z-ash mt-3 font-mono">
            Pastikan sesi Chrome extension anda disimpan sebelum menghantar.
          </p>
        </div>
      </motion.div>

      {/* ── Recent submissions ─────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.16 }}
        className="card"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-lg font-bold text-z-snow">Penyerahan Terbaru</h2>
          <button onClick={() => navigate('/history')} className="text-xs font-bold text-z-fog hover:text-z-green transition-colors font-mono">
            Lihat semua →
          </button>
        </div>

        {recent.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-12 h-12 bg-z-lift border border-z-rim rounded-2xl flex items-center justify-center text-z-ash">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <p className="text-z-fog text-sm font-semibold">Tiada penyerahan lagi</p>
            <p className="text-z-ash text-xs">Tekan "Hantar Sekarang" untuk bermula.</p>
          </div>
        ) : (
          recent.map(s => <BookCard key={s.id} submission={s} />)
        )}
      </motion.div>

    </div>
  )
}

function MiniStat({ icon, label, value, sub, highlight }) {
  return (
    <div className={`card py-4 flex items-center gap-4 ${highlight ? 'border-z-green/20' : ''}`}>
      <span className="text-2xl">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-z-fog uppercase tracking-wide mb-0.5">{label}</p>
        <p className="font-display font-bold text-z-snow truncate">{value}</p>
        <p className="text-xs text-z-ash">{sub}</p>
      </div>
    </div>
  )
}
