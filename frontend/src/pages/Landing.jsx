import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'

/* ── animation helpers ─────────────────────────────── */
const up = (delay = 0) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay, ease: [0.25, 0.1, 0.25, 1] },
})

const inView = (delay = 0) => ({
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.5, delay, ease: [0.25, 0.1, 0.25, 1] },
})

/* ── Bot demo mockup ───────────────────────────────── */
const DEMO_BOOKS = [
  { title: 'Hujan', author: 'Nur Maisarah', lang: 'BM' },
  { title: 'Totto-Chan', author: 'Tetsuko K.', lang: 'BM' },
  { title: 'Aku Terima Nikahnya', author: 'Hlovate', lang: 'BM' },
  { title: 'Harry Potter 1', author: 'J.K. Rowling', lang: 'EN' },
]
const MESSAGES = [
  'Connecting to AINS portal…',
  'Logging in with your session…',
  'Submitting book records…',
  'All 4 records submitted ✓',
]

function BotDemo() {
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setPhase(p => (p + 1) % 5), 1800)
    return () => clearInterval(t)
  }, [])

  return (
    <motion.div {...up(0.3)} className="relative">
      {/* Outer glow ring */}
      <div className="absolute inset-0 rounded-2xl bg-z-green/5 blur-2xl scale-105 pointer-events-none" />

      <div className="relative bg-z-card border border-z-rim rounded-2xl overflow-hidden shadow-glow-g-sm">
        {/* Terminal titlebar */}
        <div className="bg-z-lift border-b border-z-rim px-4 py-3 flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-z-red/70" />
          <span className="w-3 h-3 rounded-full bg-z-amber/70" />
          <span className="w-3 h-3 rounded-full bg-z-green/70" />
          <span className="ml-3 font-mono text-xs text-z-ash">nilam-auto — bot process</span>
        </div>

        {/* Book rows */}
        <div className="p-5 space-y-3">
          {DEMO_BOOKS.map((b, i) => {
            const submitted = phase > i
            const active    = phase === i
            return (
              <motion.div
                key={b.title}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.12 }}
                className="flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-lg bg-z-lift flex items-center justify-center font-mono text-xs font-bold text-z-green">
                  {b.lang}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-z-snow truncate">{b.title}</p>
                  <p className="text-xs text-z-fog">{b.author}</p>
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border transition-all duration-500 ${
                  submitted
                    ? 'bg-z-green/10 text-z-green border-z-green/30'
                    : active
                    ? 'bg-z-amber/10 text-z-amber border-z-amber/30 animate-pulse'
                    : 'bg-z-lift text-z-ash border-z-rim'
                }`}>
                  {submitted ? 'Berjaya' : active ? 'Hantar…' : 'Tunggu'}
                </span>
              </motion.div>
            )
          })}
        </div>

        {/* Status bar */}
        <div className="border-t border-z-rim px-5 py-3 flex items-center gap-2.5">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${phase >= 4 ? 'bg-z-green' : 'bg-z-green animate-pulse'}`} />
          <span className="font-mono text-xs text-z-fog">{MESSAGES[Math.min(phase, 3)]}</span>
        </div>
      </div>
    </motion.div>
  )
}

/* ── Main component ────────────────────────────────── */
export default function Landing() {
  const navigate = useNavigate()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode]         = useState('login')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  async function handleAuth(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (data?.user) {
          await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: data.user.id, email: data.user.email }),
          })
        }
        setError('Check your email to confirm your account.')
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        if (data?.user) {
          await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: data.user.id, email: data.user.email }),
          })
        }
        navigate('/dashboard')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-z-void text-z-snow overflow-x-hidden">

      {/* ── Nav ──────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-z-void/80 backdrop-blur-md border-b border-z-rim">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-z-green rounded-lg flex items-center justify-center">
              <BookIcon className="w-4 h-4 text-z-void" />
            </div>
            <span className="font-display font-bold text-z-snow tracking-tight">Nilam Auto</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setMode('login'); document.getElementById('auth')?.scrollIntoView({ behavior: 'smooth' }) }}
              className="text-sm font-semibold text-z-fog hover:text-z-snow px-4 py-2 rounded-xl hover:bg-z-lift transition-all"
            >
              Sign In
            </button>
            <button
              onClick={() => { setMode('signup'); document.getElementById('auth')?.scrollIntoView({ behavior: 'smooth' }) }}
              className="btn-primary !px-4 !py-2 text-sm"
            >
              Mulakan Percuma
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────── */}
      <section className="relative bg-mesh overflow-hidden">
        {/* Decorative rings */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full border border-z-green/5 pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full border border-z-green/8 pointer-events-none" />

        <div className="max-w-6xl mx-auto px-5 py-16 lg:py-24 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">

          {/* Left */}
          <div>
            <motion.div {...up(0)} className="inline-flex items-center gap-2 bg-z-green/10 border border-z-green/25 text-z-green text-xs font-bold px-3 py-1.5 rounded-full mb-6">
              <span className="w-1.5 h-1.5 bg-z-green rounded-full animate-pulse" />
              Untuk pelajar Malaysia
            </motion.div>

            <motion.h1 {...up(0.05)} className="font-display text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold leading-[1.1] mb-5">
              Automate Your{' '}
              <span className="text-z-green">NILAM</span>
              <br />Submissions.
              <br />Forever.
            </motion.h1>

            <motion.p {...up(0.1)} className="text-z-fog text-lg leading-relaxed mb-8 max-w-md">
              Nilam Auto submits your reading records on{' '}
              <span className="text-z-snow font-semibold">ains.moe.gov.my</span>{' '}
              automatically every month — so you never miss a deadline.
            </motion.p>

            <motion.div {...up(0.15)} className="flex flex-col sm:flex-row gap-3 mb-12">
              <button
                onClick={() => { setMode('signup'); document.getElementById('auth')?.scrollIntoView({ behavior: 'smooth' }) }}
                className="btn-primary text-base px-8 py-3.5"
              >
                Mulakan Percuma
                <ArrowIcon />
              </button>
              <button
                onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })}
                className="btn-ghost text-base"
              >
                Tengok Cara Kerja
              </button>
            </motion.div>

            {/* Trust stats */}
            <motion.div {...up(0.2)} className="flex gap-6 flex-wrap border-t border-z-rim pt-6">
              {[
                { v: '1,000+', l: 'Pelajar Malaysia' },
                { v: 'Sehingga 8', l: 'buku / bulan' },
                { v: '< 2 min', l: 'masa persediaan' },
              ].map(s => (
                <div key={s.l}>
                  <p className="font-display font-bold text-xl text-z-snow">{s.v}</p>
                  <p className="text-xs text-z-fog mt-0.5">{s.l}</p>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right: Bot demo */}
          <div className="lg:pl-8">
            <BotDemo />
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────── */}
      <section className="py-20 border-t border-z-rim">
        <div className="max-w-6xl mx-auto px-5">
          <motion.div {...inView()} className="text-center mb-12">
            <p className="text-z-green text-xs font-bold uppercase tracking-widest font-mono mb-3">Ciri-ciri</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-z-snow">
              Everything you need.<br />Nothing you don't.
            </h2>
          </motion.div>

          {/* Magazine-style feature grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Big feature */}
            <motion.div {...inView(0)} className="sm:col-span-2 card-glow relative overflow-hidden group">
              <div className="absolute top-4 right-4 w-24 h-24 rounded-full bg-z-green/5 blur-2xl group-hover:bg-z-green/10 transition-all" />
              <div className="w-12 h-12 bg-z-green/10 border border-z-green/25 rounded-xl flex items-center justify-center text-z-green mb-5">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3" /></svg>
              </div>
              <h3 className="font-display text-xl font-bold text-z-snow mb-2">One-Click Extension</h3>
              <p className="text-z-fog leading-relaxed">Install the Chrome extension, log in to AINS once, and we capture your session. That's it. Your credentials are encrypted with AES-256 and never stored in plain text.</p>
            </motion.div>

            <motion.div {...inView(0.08)} className="card group hover:border-z-green/20 hover:shadow-glow-g-sm transition-all duration-300">
              <div className="w-10 h-10 bg-z-blue/10 border border-z-blue/25 rounded-xl flex items-center justify-center text-z-blue mb-4">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" /></svg>
              </div>
              <h3 className="font-display text-lg font-bold text-z-snow mb-2">4 Bahasa</h3>
              <p className="text-z-fog text-sm leading-relaxed">Melayu, Inggeris, Cina, Tamil — pilih bahasa buku dan kami akan hantar rekod yang betul.</p>
            </motion.div>

            <motion.div {...inView(0.12)} className="card group hover:border-z-amber/20 transition-all duration-300">
              <div className="w-10 h-10 bg-z-amber/10 border border-z-amber/25 rounded-xl flex items-center justify-center text-z-amber mb-4">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" /></svg>
              </div>
              <h3 className="font-display text-lg font-bold text-z-snow mb-2">Auto-Jadual</h3>
              <p className="text-z-fog text-sm leading-relaxed">Pilih hari dalam bulan. Kami hantar rekod secara automatik tanpa perlu ingat.</p>
            </motion.div>

            <motion.div {...inView(0.16)} className="card group hover:border-z-blue/20 transition-all duration-300">
              <div className="w-10 h-10 bg-z-blue/10 border border-z-blue/25 rounded-xl flex items-center justify-center text-z-blue mb-4">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>
              </div>
              <h3 className="font-display text-lg font-bold text-z-snow mb-2">Sejarah Lengkap</h3>
              <p className="text-z-fog text-sm leading-relaxed">Lihat semua penyerahan dengan status, tarikh, dan nama buku dalam satu paparan.</p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────── */}
      <section id="how" className="py-20 border-t border-z-rim bg-z-card/30">
        <div className="max-w-6xl mx-auto px-5">
          <motion.div {...inView()} className="text-center mb-14">
            <p className="text-z-green text-xs font-bold uppercase tracking-widest font-mono mb-3">Cara kerja</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold">3 langkah. Selamanya automatik.</h2>
          </motion.div>

          <div className="relative">
            {/* Connecting line (desktop) */}
            <div className="hidden lg:block absolute top-[3.5rem] left-[calc(16.67%+2rem)] right-[calc(16.67%+2rem)] h-px bg-gradient-to-r from-z-rim via-z-green/40 to-z-rim" />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {[
                {
                  n: '01', color: 'text-z-green', bg: 'bg-z-green/10 border-z-green/25',
                  title: 'Connect',
                  desc: 'Install extension Chrome, log in ke AINS sekali. Kami simpan sesi anda dengan penyulitan AES-256.',
                  icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>,
                },
                {
                  n: '02', color: 'text-z-blue', bg: 'bg-z-blue/10 border-z-blue/25',
                  title: 'Configure',
                  desc: 'Pilih bahasa, bilangan buku (1–8), dan hari dalam bulan untuk penyerahan automatik.',
                  icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
                },
                {
                  n: '03', color: 'text-z-amber', bg: 'bg-z-amber/10 border-z-amber/25',
                  title: 'Relax',
                  desc: 'Bot kami hantar rekod bacaan setiap bulan pada hari yang anda tetapkan. Tiada lagi kemasukan data manual.',
                  icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
                },
              ].map((step, i) => (
                <motion.div key={step.n} {...inView(i * 0.1)} className="relative">
                  <div className={`card hover:border-z-green/20 transition-all duration-300`}>
                    <div className="flex items-center gap-3 mb-5">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${step.bg} ${step.color}`}>
                        {step.icon}
                      </div>
                      <span className="font-mono text-xs text-z-ash font-bold">{step.n}</span>
                    </div>
                    <h3 className="font-display text-xl font-bold text-z-snow mb-2">{step.title}</h3>
                    <p className="text-z-fog text-sm leading-relaxed">{step.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────── */}
      <section className="py-20 border-t border-z-rim">
        <div className="max-w-4xl mx-auto px-5">
          <motion.div {...inView()} className="text-center mb-12">
            <p className="text-z-green text-xs font-bold uppercase tracking-widest font-mono mb-3">Harga</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold">Mulakan percuma. Upgrade bila sedia.</h2>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Free */}
            <motion.div {...inView(0)} className="card flex flex-col">
              <p className="text-z-fog text-sm font-semibold mb-1">Percuma</p>
              <p className="font-display text-4xl font-extrabold text-z-snow mb-1">RM0</p>
              <p className="text-z-ash text-xs mb-6">Selamanya</p>
              <ul className="space-y-3 flex-1 mb-6">
                {['1 buku / bulan', '1 bahasa sahaja', 'Sejarah 7 hari', 'Hantar manual sahaja'].map(f => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-z-fog">
                    <span className="w-4 h-4 rounded-full bg-z-lift flex items-center justify-center flex-shrink-0">
                      <svg className="w-2.5 h-2.5 text-z-ash" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => document.getElementById('auth')?.scrollIntoView({ behavior: 'smooth' })}
                className="btn-ghost w-full"
              >
                Mulakan Percuma
              </button>
            </motion.div>

            {/* Pro */}
            <motion.div {...inView(0.08)} className="relative card-glow flex flex-col">
              {/* Popular badge */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-z-green text-z-void text-xs font-black px-4 py-1 rounded-full">
                PALING POPULAR
              </div>
              <p className="text-z-green text-sm font-bold mb-1">Pro</p>
              <p className="font-display text-4xl font-extrabold text-z-snow mb-1">RM18</p>
              <p className="text-z-ash text-xs mb-6">/ tahun — kurang RM1.50 sebulan</p>
              <ul className="space-y-3 flex-1 mb-6">
                {[
                  'Sehingga 8 buku / bulan',
                  'Semua 4 bahasa',
                  'Auto-jadual bulanan',
                  'Sejarah penuh',
                  'Pemberitahuan status',
                  'Sokongan keutamaan',
                ].map(f => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-z-snow">
                    <span className="w-4 h-4 rounded-full bg-z-green/15 flex items-center justify-center flex-shrink-0">
                      <svg className="w-2.5 h-2.5 text-z-green" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => navigate('/upgrade')}
                className="btn-primary w-full text-base py-3.5"
              >
                Dapatkan Pro
                <ArrowIcon />
              </button>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Auth modal-like section ───────────────────── */}
      <section id="auth" className="py-20 border-t border-z-rim bg-z-card/20">
        <div className="max-w-md mx-auto px-5">
          <motion.div {...inView()} className="text-center mb-8">
            <h2 className="font-display text-2xl font-bold text-z-snow mb-2">
              {mode === 'login' ? 'Selamat kembali' : 'Mulakan perjalanan anda'}
            </h2>
            <p className="text-z-fog text-sm">
              {mode === 'login' ? 'Log masuk ke akaun Nilam Auto anda.' : 'Buat akaun percuma dalam masa beberapa saat.'}
            </p>
          </motion.div>

          <motion.div {...inView(0.05)} className="card-glow">
            {/* Tabs */}
            <div className="flex bg-z-lift rounded-xl p-1 mb-6">
              {['login', 'signup'].map(m => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setError('') }}
                  className={`flex-1 text-sm font-bold py-2 rounded-lg transition-all ${
                    mode === m ? 'bg-z-green text-z-void shadow-sm' : 'text-z-fog hover:text-z-snow'
                  }`}
                >
                  {m === 'login' ? 'Log Masuk' : 'Daftar'}
                </button>
              ))}
            </div>

            <form onSubmit={handleAuth} className="space-y-4">
              <div>
                <label className="label">Alamat E-mel</label>
                <input type="email" className="input" placeholder="anda@sekolah.edu.my" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div>
                <label className="label">Kata Laluan</label>
                <input type="password" className="input" placeholder="Masukkan kata laluan" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>

              {error && (
                <div className={`flex items-start gap-2.5 text-sm rounded-xl px-4 py-3 border ${
                  error.includes('Check your email')
                    ? 'bg-z-green/10 text-z-green border-z-green/25'
                    : 'bg-z-red/10 text-z-red border-z-red/25'
                }`}>
                  <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 text-base mt-2">
                {loading
                  ? <><span className="w-4 h-4 border-2 border-z-void/30 border-t-z-void rounded-full animate-spin" />Sila tunggu...</>
                  : mode === 'login' ? 'Log Masuk' : 'Buat Akaun'}
              </button>
            </form>

            <p className="text-center text-xs text-z-ash mt-4">
              Kelayakan AINS anda disulitkan dan tidak pernah disimpan sebagai teks biasa.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────── */}
      <footer className="border-t border-z-rim py-8">
        <div className="max-w-6xl mx-auto px-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-z-green rounded-lg flex items-center justify-center">
              <BookIcon className="w-4 h-4 text-z-void" />
            </div>
            <span className="font-display font-bold text-z-snow text-sm">Nilam Auto</span>
          </div>
          <p className="text-z-ash text-xs text-center">
            Untuk pelajar Malaysia. Tidak bersekutu dengan KPM atau Kementerian Pelajaran.
          </p>
        </div>
      </footer>

    </div>
  )
}

/* ── Icons ─────────────────────────────────────────── */
function BookIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}
function ArrowIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  )
}
