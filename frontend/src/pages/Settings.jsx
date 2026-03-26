import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'

const BACKEND    = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
const LANGUAGES  = ['Melayu', 'Inggeris', 'Cina', 'Tamil']
const BOOK_TYPES = ['Fizikal', 'E-Buku']

/* ── Mini calendar ─────────────────────────────────── */
function MiniCalendar({ selected, onSelect }) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
        <button
          key={d}
          type="button"
          onClick={() => onSelect(d)}
          className={`h-9 rounded-xl text-xs font-bold transition-all duration-150 ${
            selected === d
              ? 'bg-z-green text-z-void shadow-glow-g-sm scale-105'
              : 'bg-z-lift text-z-fog border border-z-rim hover:border-z-green/40 hover:text-z-green'
          }`}
        >
          {d}
        </button>
      ))}
    </div>
  )
}

/* ── Number stepper ────────────────────────────────── */
function Stepper({ value, min, max, onChange }) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="w-11 h-11 rounded-xl bg-z-lift border border-z-rim text-z-fog text-xl font-bold hover:border-z-green/40 hover:text-z-green transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
      >
        −
      </button>
      <div className="flex-1 text-center">
        <span className="font-display text-4xl font-extrabold text-z-green">{value}</span>
        <p className="text-xs text-z-fog mt-1">buku / bulan</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="w-11 h-11 rounded-xl bg-z-lift border border-z-rim text-z-fog text-xl font-bold hover:border-z-green/40 hover:text-z-green transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
      >
        +
      </button>
    </div>
  )
}

/* ── Main ──────────────────────────────────────────── */
export default function Settings() {
  const [user, setUser]         = useState(null)
  const [form, setForm]         = useState({
    books_per_month: 4,
    language: 'Melayu',
    book_type: 'Fizikal',
    auto_schedule: true,
    schedule_day: 15,
  })
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [loading, setLoading]   = useState(true)
  const [cookieStatus, setCookieStatus] = useState(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUser(user)

      const res = await fetch(`${BACKEND}/api/settings?userId=${user.id}`)
      if (res.ok) {
        const data = await res.json()
        setForm({
          books_per_month: data.books_per_month ?? 4,
          language:        data.language ?? 'Melayu',
          book_type:       data.book_type ?? 'Fizikal',
          auto_schedule:   data.auto_schedule ?? true,
          schedule_day:    data.schedule_day ?? 15,
        })
      }

      const { data: ud } = await supabase
        .from('users').select('cookie_updated_at').eq('id', user.id).single()
      if (ud?.cookie_updated_at) {
        const age = Date.now() - new Date(ud.cookie_updated_at).getTime()
        setCookieStatus(age < 7 * 24 * 60 * 60 * 1000 ? 'fresh' : 'stale')
      }

      setLoading(false)
    }
    load()
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    setSaved(false)
    const res = await fetch(`${BACKEND}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, ...form }),
    })
    setSaving(false)
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 3000) }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-10 h-10 border-2 border-z-rim border-t-z-green rounded-full animate-spin" />
    </div>
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="max-w-2xl space-y-6"
    >
      <div>
        <h1 className="font-display text-2xl font-extrabold text-z-snow">Tetapan</h1>
        <p className="text-z-fog text-sm mt-1">Konfigurasikan automasi NILAM anda.</p>
      </div>

      {/* ── Cookie status ───────────────────────────── */}
      <div className={`card border-l-4 ${
        cookieStatus === 'fresh'  ? 'border-l-z-green' :
        cookieStatus === 'stale' ? 'border-l-z-amber' :
        'border-l-z-rim'
      }`}>
        <div className="flex items-start gap-3">
          <div className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${
            cookieStatus === 'fresh' ? 'bg-z-green' :
            cookieStatus === 'stale' ? 'bg-z-amber animate-pulse' :
            'bg-z-ash'
          }`} />
          <div>
            <p className="text-sm font-bold text-z-snow">
              {cookieStatus === 'fresh' ? 'Sesi Aktif' :
               cookieStatus === 'stale' ? 'Sesi Mungkin Luput' :
               'Tiada Sesi Disimpan'}
            </p>
            <p className="text-xs text-z-fog mt-0.5">
              {cookieStatus === 'fresh' ? 'Cookie AINS anda segar dan sedia digunakan.' :
               cookieStatus === 'stale' ? 'Log masuk semula ke AINS melalui extension Chrome.' :
               'Pasang extension Chrome dan lawati ains.moe.gov.my.'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Form ────────────────────────────────────── */}
      <form onSubmit={handleSave} className="space-y-6">

        {/* Books per month — stepper */}
        <div className="card">
          <label className="label">Buku Per Bulan</label>
          <div className="mt-4 mb-2">
            <Stepper
              value={form.books_per_month}
              min={1} max={8}
              onChange={v => setForm(f => ({ ...f, books_per_month: v }))}
            />
          </div>
          <p className="text-xs text-z-ash text-center mt-2 font-mono">Maksimum 8 buku sebulan</p>
        </div>

        {/* Language */}
        <div className="card">
          <label className="label">Bahasa Buku</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
            {LANGUAGES.map(lang => (
              <button
                key={lang}
                type="button"
                onClick={() => setForm(f => ({ ...f, language: lang }))}
                className={`py-3 px-3 rounded-xl text-sm font-bold border transition-all duration-150 ${
                  form.language === lang
                    ? 'bg-z-green text-z-void border-z-green shadow-glow-g-sm scale-[1.02]'
                    : 'bg-z-lift text-z-fog border-z-rim hover:border-z-green/40 hover:text-z-green'
                }`}
              >
                {lang}
              </button>
            ))}
          </div>
        </div>

        {/* Book type */}
        <div className="card">
          <label className="label">Jenis Buku</label>
          <div className="flex gap-2 mt-1">
            {BOOK_TYPES.map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setForm(f => ({ ...f, book_type: type }))}
                className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold border transition-all duration-150 ${
                  form.book_type === type
                    ? 'bg-z-green text-z-void border-z-green shadow-glow-g-sm'
                    : 'bg-z-lift text-z-fog border-z-rim hover:border-z-green/40 hover:text-z-green'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Auto schedule toggle */}
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-z-snow">Auto-Jadual</p>
              <p className="text-xs text-z-fog mt-0.5">Hantar secara automatik pada hari tertentu setiap bulan</p>
            </div>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, auto_schedule: !f.auto_schedule }))}
              className={`relative inline-flex h-7 w-13 items-center rounded-full transition-colors duration-200 ${form.auto_schedule ? 'bg-z-green' : 'bg-z-lift border border-z-rim'}`}
              style={{ width: 52 }}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${form.auto_schedule ? 'translate-x-7' : 'translate-x-1'}`}
                style={{ boxShadow: form.auto_schedule ? '0 0 8px rgba(0,255,133,0.5)' : undefined }}
              />
            </button>
          </div>

          {/* Calendar when auto_schedule is on */}
          {form.auto_schedule && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-5"
            >
              <p className="text-xs text-z-fog mb-3">
                Hantar pada hari{' '}
                <span className="font-display font-bold text-z-green text-base">{form.schedule_day}</span>
                {' '}setiap bulan
              </p>
              <MiniCalendar
                selected={form.schedule_day}
                onSelect={d => setForm(f => ({ ...f, schedule_day: d }))}
              />
            </motion.div>
          )}
        </div>

        {/* Save button */}
        <button
          type="submit"
          disabled={saving}
          className={`w-full py-4 text-base font-bold rounded-xl transition-all duration-200 ${
            saved
              ? 'bg-z-green/20 text-z-green border border-z-green/40'
              : 'btn-primary'
          }`}
        >
          {saving ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-z-void/30 border-t-z-void rounded-full animate-spin" />
              Menyimpan…
            </span>
          ) : saved ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Tersimpan!
            </span>
          ) : 'Simpan Tetapan'}
        </button>
      </form>
    </motion.div>
  )
}
