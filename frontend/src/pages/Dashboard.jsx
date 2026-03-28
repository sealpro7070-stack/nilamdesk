import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import BookCard from '../components/BookCard'
import ConnectAINSModal from '../components/ConnectAINSModal'

const BACKEND   = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
const LANGUAGES = ['Malay', 'English', 'Chinese', 'Tamil']
const LANG_MAP  = { Malay: 'Melayu', English: 'Inggeris', Chinese: 'Cina', Tamil: 'Tamil' }
const LANG_DISPLAY = { Melayu: 'Malay', Inggeris: 'English', Cina: 'Chinese', Tamil: 'Tamil' }

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
  const [credsStatus, setCredsStatus] = useState(null)
  const [plan, setPlan]             = useState('free')
  const [showAINSModal, setShowAINSModal] = useState(false)

  // Family plan state
  const [familySlots, setFamilySlots]   = useState([])
  const [newSlotName, setNewSlotName]   = useState('')
  const [addingSlot, setAddingSlot]     = useState(false)
  const [addSlotErr, setAddSlotErr]     = useState('')
  // Per-slot UI state: { [slotId]: { phase, email, password, showForm, trigMsg, trigErr } }
  const [slotStates, setSlotStates]     = useState({})
  const pollRefs = useRef({})

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setLoading(false); return }
        setUser(user)

        // Ensure user row exists in backend — handles Google OAuth logins
        // that bypass Landing.jsx's register call. Safe to call every time (upsert).
        fetch(`${BACKEND}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: user.id, email: user.email }),
        }).catch(() => {})

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

        const { data: ud } = await supabase
          .from('users').select('ains_cookie_encrypted, plan').eq('id', user.id).single()
        const connected = !!ud?.ains_cookie_encrypted
        setCredsStatus(connected ? 'saved' : 'none')
        const userPlan = ud?.plan || 'free'
        setPlan(userPlan)
        if (!connected) setShowAINSModal(true)

        // Load family slots if on family plan
        if (userPlan === 'family') {
          await loadFamilySlots(user)
        }
      } catch {
        // Supabase unreachable
      } finally {
        setLoading(false)
      }
    }
    load()
    return () => {
      // Cleanup any slot polling on unmount
      Object.values(pollRefs.current).forEach(clearInterval)
    }
  }, [])

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token || ''
  }

  async function loadFamilySlots(u) {
    const token = await getToken()
    const res = await fetch(`${BACKEND}/api/family/slots`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    if (res.ok) {
      const d = await res.json()
      setFamilySlots(d.slots || [])
    }
  }

  async function doTrigger(userId, apiLang, count) {
    setTriggering(true)
    setTriggerMsg('')
    setIsError(false)
    try {
      const token = await getToken()
      await fetch(`${BACKEND}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, language: apiLang, books_per_month: count }),
      })
      const res  = await fetch(`${BACKEND}/api/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ userId, count }),
      })
      const data = await res.json()
      if (!res.ok || data.success === false) throw new Error(data.error || 'Failed to start')
      setTriggerMsg(data.message || 'Done! Check History for details.')
      setSettings(s => ({ ...s, language: apiLang, books_per_month: count }))
    } catch (err) {
      setTriggerMsg(err.message)
      setIsError(true)
      if (/session expired|reconnect/i.test(err.message)) setCredsStatus('none')
    } finally {
      setTriggering(false)
    }
  }

  async function handleSubmit() {
    if (!user) return
    if (credsStatus !== 'saved') { setShowAINSModal(true); return }
    await doTrigger(user.id, LANG_MAP[lang] || lang, bookCount)
  }

  const handleAINSConnected = async () => {
    const { data: ud } = await supabase
      .from('users').select('ains_cookie_encrypted').eq('id', user.id).single()
    setCredsStatus(ud?.ains_cookie_encrypted ? 'saved' : 'none')
    if (ud?.ains_cookie_encrypted) {
      await doTrigger(user.id, LANG_MAP[lang] || lang, bookCount)
    }
  }

  // ── Family slot helpers ─────────────────────────

  function setSlot(slotId, patch) {
    setSlotStates(prev => ({ ...prev, [slotId]: { ...prev[slotId], ...patch } }))
  }

  async function handleAddSlot() {
    if (!newSlotName.trim()) return
    setAddingSlot(true)
    setAddSlotErr('')
    try {
      const token = await getToken()
      const res = await fetch(`${BACKEND}/api/family/slots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ slot_name: newSlotName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add slot')
      setNewSlotName('')
      await loadFamilySlots(user)
    } catch (err) {
      setAddSlotErr(err.message)
    } finally {
      setAddingSlot(false)
    }
  }

  async function handleRemoveSlot(slotId) {
    const token = await getToken()
    await fetch(`${BACKEND}/api/family/slots/${slotId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    })
    clearInterval(pollRefs.current[slotId])
    setFamilySlots(prev => prev.filter(s => s.id !== slotId))
    setSlotStates(prev => { const n = { ...prev }; delete n[slotId]; return n })
  }

  async function handleConnectSlot(slotId) {
    const ss = slotStates[slotId] || {}
    if (!ss.email?.trim() || !ss.password?.trim()) return
    setSlot(slotId, { phase: 'connecting' })

    const token = await getToken()
    const res = await fetch(`${BACKEND}/api/family/slots/${slotId}/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ email: ss.email.trim(), password: ss.password }),
    })
    if (!res.ok) {
      const d = await res.json()
      setSlot(slotId, { phase: 'error', connectErr: d.error || 'Failed to start' })
      return
    }

    // Poll connect-status every 2s (max 3 min)
    let attempts = 0
    const poll = setInterval(async () => {
      attempts++
      if (attempts > 90) { // 90 × 2s = 3 min
        clearInterval(poll)
        setSlot(slotId, { phase: 'error', connectErr: 'Timed out. Please try again.' })
        return
      }
      try {
        const t = await getToken()
        const r = await fetch(`${BACKEND}/api/family/slots/${slotId}/connect-status`, {
          headers: { 'Authorization': `Bearer ${t}` },
        })
        const d = await r.json()
        if (d.connected) {
          clearInterval(poll)
          setSlot(slotId, { phase: 'done', showForm: false, email: '', password: '' })
          await loadFamilySlots(user)
        }
      } catch {}
    }, 2000)
    pollRefs.current[slotId] = poll
  }

  async function handleTriggerSlot(slotId) {
    setSlot(slotId, { trigMsg: '', trigErr: false, triggering: true })
    try {
      const token = await getToken()
      const res = await fetch(`${BACKEND}/api/family/slots/${slotId}/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok || data.success === false) throw new Error(data.error || 'Failed to submit')
      setSlot(slotId, { trigMsg: data.message, trigErr: false, triggering: false })
    } catch (err) {
      setSlot(slotId, { trigMsg: err.message, trigErr: true, triggering: false })
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
          <button
            onClick={() => setShowAINSModal(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full flex-shrink-0 transition-opacity hover:opacity-80 ${credsStatus === 'saved' ? 'bg-white/15' : 'bg-warn-500/80'}`}
            title={credsStatus === 'saved' ? 'Click to reconnect AINS' : 'Click to connect AINS'}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${credsStatus === 'saved' ? 'bg-ok-400 animate-pulse' : 'bg-white'}`} />
            <span className="text-white text-xs font-bold">
              {credsStatus === 'saved' ? 'AINS Connected' : 'AINS Not Set'}
            </span>
          </button>
        </div>

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
                onClick={() => setBookCount(v => Math.min(plan === 'free' ? 1 : 15, v + 1))}
                disabled={bookCount >= (plan === 'free' ? 1 : 15)}
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
            ) : credsStatus !== 'saved' ? (
              <><LockIcon className="w-4 h-4" />Connect & Submit</>
            ) : (
              <><BoltIcon className="w-4 h-4" />Submit {bookCount} {lang} Book{bookCount !== 1 ? 's' : ''}</>
            )}
          </button>
          {triggerMsg && (
            <span className={`text-sm font-bold flex items-center gap-1.5 ${isError ? 'text-danger-600' : 'text-ok-600'}`}>
              {isError ? <XCircleIcon className="w-4 h-4" /> : <CheckCircleIcon className="w-4 h-4" />}
              {triggerMsg}
            </span>
          )}
        </div>

        <p className="text-xs text-subtle mt-3">
          {credsStatus === 'saved'
            ? 'Your AINS session is active. The bot will use it for monthly submissions.'
            : 'Click "Connect & Submit" to log in to your AINS account.'}
        </p>
      </motion.div>

      {/* ── Family Slots Panel ─────────────────────── */}
      {plan === 'family' && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.15 }}
          className="card-p border-l-4 border-l-ok-500"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-bold text-heading flex items-center gap-2">
              <span className="w-8 h-8 bg-ok-50 rounded-lg flex items-center justify-center">
                <UsersIcon className="w-4 h-4 text-ok-600" />
              </span>
              Family Slots
            </h2>
            <span className="text-xs text-muted font-semibold">{familySlots.length} / 3 slots</span>
          </div>

          {/* Slot cards */}
          <div className="space-y-4">
            {familySlots.map(slot => {
              const ss = slotStates[slot.id] || {}
              return (
                <div key={slot.id} className="border border-line rounded-xl p-4 space-y-3">
                  {/* Header row */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${slot.ains_connected ? 'bg-ok-500' : 'bg-danger-400 animate-pulse'}`} />
                      <span className="font-bold text-sm text-heading truncate">{slot.slot_name}</span>
                      {slot.ains_email && (
                        <span className="text-xs text-muted truncate hidden sm:block">{slot.ains_email}</span>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemoveSlot(slot.id)}
                      className="text-xs text-danger-500 hover:text-danger-700 font-bold flex-shrink-0"
                      title="Remove slot"
                    >
                      Remove
                    </button>
                  </div>

                  {/* Settings row */}
                  <div className="flex items-center gap-3 text-xs text-muted flex-wrap">
                    <span className="bg-gray-100 px-2 py-0.5 rounded-md font-medium">
                      {LANG_DISPLAY[slot.language] || slot.language || 'Malay'}
                    </span>
                    <span className="bg-gray-100 px-2 py-0.5 rounded-md font-medium">
                      {slot.books_per_month || 4} books/month
                    </span>
                    <span className={`px-2 py-0.5 rounded-md font-medium ${slot.ains_connected ? 'bg-ok-50 text-ok-700' : 'bg-danger-50 text-danger-600'}`}>
                      {slot.ains_connected ? 'Connected' : 'Not connected'}
                    </span>
                  </div>

                  {/* Connect form */}
                  {(!slot.ains_connected || ss.showForm) && ss.phase !== 'connecting' && ss.phase !== 'done' && (
                    <>
                      {ss.showForm ? (
                        <div className="space-y-2 pt-1">
                          <input
                            type="email"
                            placeholder="AINS email"
                            value={ss.email || ''}
                            onChange={e => setSlot(slot.id, { email: e.target.value })}
                            className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                          />
                          <input
                            type="password"
                            placeholder="Password"
                            value={ss.password || ''}
                            onChange={e => setSlot(slot.id, { password: e.target.value })}
                            className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                          />
                          {ss.connectErr && (
                            <p className="text-xs text-danger-600 font-semibold">{ss.connectErr}</p>
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleConnectSlot(slot.id)}
                              disabled={!ss.email || !ss.password}
                              className="flex-1 py-2 bg-brand-600 text-white text-sm font-bold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
                            >
                              Connect
                            </button>
                            <button
                              onClick={() => setSlot(slot.id, { showForm: false, email: '', password: '' })}
                              className="px-3 py-2 border border-line text-muted text-sm font-bold rounded-lg hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setSlot(slot.id, { showForm: true, phase: null })}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-brand-50 text-brand-600 hover:bg-brand-100 transition-colors"
                        >
                          Connect AINS
                        </button>
                      )}
                    </>
                  )}

                  {/* Connecting state */}
                  {ss.phase === 'connecting' && (
                    <div className="flex items-center gap-2 text-sm text-muted">
                      <span className="w-4 h-4 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin flex-shrink-0" />
                      <span>Signing in… approve the MFA notification on your phone.</span>
                    </div>
                  )}

                  {/* Error state */}
                  {ss.phase === 'error' && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs text-danger-600 font-semibold">{ss.connectErr}</p>
                      <button
                        onClick={() => setSlot(slot.id, { phase: null, showForm: true })}
                        className="text-xs font-bold px-3 py-1 rounded-lg bg-danger-50 text-danger-600 hover:bg-danger-100"
                      >
                        Try Again
                      </button>
                    </div>
                  )}

                  {/* Trigger row (only when connected) */}
                  {slot.ains_connected && (
                    <div className="flex items-center gap-3 flex-wrap pt-1">
                      <button
                        onClick={() => handleTriggerSlot(slot.id)}
                        disabled={ss.triggering}
                        className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5"
                      >
                        {ss.triggering
                          ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Submitting…</>
                          : <><BoltIcon className="w-3 h-3" />Submit Books</>
                        }
                      </button>
                      <button
                        onClick={() => setSlot(slot.id, { showForm: true, phase: 'reconnect' })}
                        className="text-xs font-bold px-3 py-2 rounded-lg bg-gray-100 text-muted hover:bg-gray-200"
                      >
                        Reconnect
                      </button>
                      {ss.trigMsg && (
                        <span className={`text-xs font-bold ${ss.trigErr ? 'text-danger-600' : 'text-ok-600'}`}>
                          {ss.trigMsg}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {familySlots.length === 0 && (
              <p className="text-sm text-muted text-center py-4">No slots yet. Add up to 3 family members below.</p>
            )}
          </div>

          {/* Add slot form */}
          {familySlots.length < 3 && (
            <div className="mt-4 pt-4 border-t border-line">
              <p className="text-xs font-bold text-muted uppercase tracking-wide mb-2">Add Slot</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. Ahmad, Sara, Aini…"
                  value={newSlotName}
                  onChange={e => setNewSlotName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddSlot()}
                  className="flex-1 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
                <button
                  onClick={handleAddSlot}
                  disabled={addingSlot || !newSlotName.trim()}
                  className="px-4 py-2 bg-ok-600 text-white text-sm font-bold rounded-lg hover:bg-ok-700 disabled:opacity-50 transition-colors"
                >
                  {addingSlot ? '…' : 'Add'}
                </button>
              </div>
              {addSlotErr && <p className="text-xs text-danger-600 font-semibold mt-1">{addSlotErr}</p>}
            </div>
          )}
        </motion.div>
      )}

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

      {/* ── AINS Connection Modal ─────────────────── */}
      <ConnectAINSModal
        userId={user?.id}
        isOpen={showAINSModal}
        onClose={() => setShowAINSModal(false)}
        onSuccess={handleAINSConnected}
      />

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
function LockIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
}
function CheckCircleIcon({ className }) {
  return <svg className={className} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
}
function XCircleIcon({ className }) {
  return <svg className={className} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/></svg>
}
function UsersIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 0 0-3-3.87"/><path strokeLinecap="round" strokeLinejoin="round" d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
}
