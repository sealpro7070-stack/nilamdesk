import { useNavigate, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

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

const DEMO_BOOKS = [
  { title: 'Hujan', author: 'Nur Maisarah', lang: 'BM' },
  { title: 'Totto-Chan', author: 'Tetsuko K.', lang: 'BM' },
  { title: 'Harry Potter 1', author: 'J.K. Rowling', lang: 'EN' },
  { title: 'The Alchemist', author: 'Paulo Coelho', lang: 'EN' },
]

function PhoneMockup() {
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setPhase(p => (p + 1) % 5), 1800)
    return () => clearInterval(t)
  }, [])

  return (
    <motion.div {...up(0.3)} className="relative flex justify-center">
      {/* Subtle glow behind phone */}
      <div className="absolute inset-4 bg-brand-100/60 rounded-3xl blur-2xl pointer-events-none" />

      {/* Phone frame */}
      <div className="relative w-64 bg-white rounded-[2rem] border-2 border-gray-200 shadow-card-lg overflow-hidden">
        {/* Status bar */}
        <div className="bg-heading px-5 pt-3 pb-2 flex items-center justify-between">
          <span className="text-white text-xs font-mono">9:41</span>
          <div className="w-16 h-4 bg-heading rounded-full border border-white/20" />
          <span className="text-white text-xs font-mono">100%</span>
        </div>

        {/* App header */}
        <div className="bg-brand-600 px-4 py-3 flex items-center gap-2">
          <div className="w-6 h-6 bg-white/20 rounded-lg flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </div>
          <span className="text-white text-sm font-bold font-display">Nilam Auto</span>
        </div>

        {/* Book list */}
        <div className="px-3 py-3 space-y-2 bg-page">
          {DEMO_BOOKS.map((b, i) => {
            const submitted = phase > i
            const active    = phase === i
            return (
              <motion.div
                key={b.title}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="bg-white rounded-xl px-3 py-2.5 flex items-center gap-2 shadow-card"
              >
                <div className="w-7 h-7 rounded-lg bg-brand-50 flex items-center justify-center font-mono text-xs font-bold text-brand-600 flex-shrink-0">
                  {b.lang}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-heading truncate">{b.title}</p>
                  <p className="text-xs text-subtle">{b.author}</p>
                </div>
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full transition-all duration-500 ${
                  submitted
                    ? 'bg-ok-100 text-ok-600'
                    : active
                    ? 'bg-warn-100 text-warn-600 animate-pulse'
                    : 'bg-gray-100 text-subtle'
                }`}>
                  {submitted ? '✓' : active ? '…' : '—'}
                </span>
              </motion.div>
            )
          })}
        </div>

        {/* Status bar */}
        <div className="bg-white border-t border-line px-3 py-2 flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-ok-500 rounded-full animate-pulse flex-shrink-0" />
          <span className="text-xs text-muted">
            {phase >= 4 ? 'All records submitted ✓' : `Submitting record ${Math.min(phase + 1, 4)}…`}
          </span>
        </div>
      </div>
    </motion.div>
  )
}

export default function Landing() {
  const navigate = useNavigate()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode]         = useState('login')
  const [loading, setLoading]   = useState(false)
  const [message, setMessage]   = useState('')
  const [isError, setIsError]   = useState(false)
  const [resending, setResending] = useState(false)
  const [resent, setResent]       = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(false)

  // When the user clicks the verification link, Supabase redirects back here
  // with a session in the URL hash. Detect it and send them to the dashboard.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        if (session.user.app_metadata?.provider) {
          syncUserToBackend(session.user)
        }
        navigate('/dashboard')
      }
    })
    return () => subscription.unsubscribe()
  }, [navigate])

  // Mirror user to backend — non-fatal, never blocks auth flow
  async function syncUserToBackend(user) {
    try {
      await fetch(`${BACKEND}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, email: user.email }),
      })
    } catch {
      // Backend unreachable (e.g. localhost fallback on mobile) — ignore, auth still works
    }
  }

  async function handleAuth(e) {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    setIsError(false)
    if (mode === 'signup' && !agreedToTerms) {
      setMessage('Please agree to the Terms of Use and Privacy Policy to continue.')
      setIsError(true)
      setLoading(false)
      return
    }
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: 'https://nilam-auto.vercel.app' },
        })
        if (error) {
          // Normalise duplicate-account errors into a friendly message
          const msg = error.message?.toLowerCase() ?? ''
          if (msg.includes('already registered') || msg.includes('already been registered') || msg.includes('email address is already taken')) {
            setMessage('An account with this email already exists. Please sign in instead.')
          } else {
            setMessage(error.message)
          }
          setIsError(true)
          return
        }
        // Supabase quirk: returns success but empty identities when email already exists + confirmation is on
        if (data?.user?.identities?.length === 0) {
          setMessage('An account with this email already exists. Please sign in instead.')
          setIsError(true)
          return
        }
        if (data?.user) syncUserToBackend(data.user)
        setMessage('Check your email to confirm your account.')
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) {
          const msg = error.message?.toLowerCase() ?? ''
          if (msg.includes('invalid login') || msg.includes('invalid credentials') || msg.includes('wrong password')) {
            setMessage('Incorrect email or password. Please try again.')
          } else if (msg.includes('email not confirmed')) {
            setMessage('Please verify your email first. Check your inbox or resend below.')
          } else {
            setMessage(error.message)
          }
          setIsError(true)
          return
        }
        if (data?.user) syncUserToBackend(data.user)
        navigate('/dashboard')
      }
    } catch (err) {
      const raw = err.message?.toLowerCase() ?? ''
      if (raw.includes('failed to fetch') || raw.includes('networkerror') || raw.includes('network request failed')) {
        setMessage('Connection error. Check your internet and try again.')
      } else {
        setMessage(err.message)
      }
      setIsError(true)
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (!email) { setMessage('Enter your email address first.'); setIsError(true); return }
    setResending(true)
    setMessage('')
    setIsError(false)
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: 'https://nilam-auto.vercel.app' },
    })
    setResending(false)
    if (error) { setMessage(error.message); setIsError(true) }
    else { setResent(true); setMessage('Verification email sent — check your inbox.') }
  }

  return (
    <div className="min-h-screen bg-page overflow-x-hidden">

      {/* ── Nav ─────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-line">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </div>
            <span className="font-display font-bold text-heading tracking-tight">Nilam Auto</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => document.getElementById('guide')?.scrollIntoView({ behavior: 'smooth' })}
              className="hidden sm:block text-sm font-semibold text-muted hover:text-heading px-4 py-2 rounded-xl hover:bg-gray-100 transition-all"
            >
              Guide
            </button>
            <button
              onClick={() => { setMode('login'); document.getElementById('auth')?.scrollIntoView({ behavior: 'smooth' }) }}
              className="text-sm font-semibold text-muted hover:text-heading px-4 py-2 rounded-xl hover:bg-gray-100 transition-all"
            >
              Sign In
            </button>
            <button
              onClick={() => { setMode('signup'); document.getElementById('auth')?.scrollIntoView({ behavior: 'smooth' }) }}
              className="btn-primary !px-4 !py-2 text-sm"
            >
              Get Started Free
            </button>
          </div>
        </div>
      </header>


      {/* ── Hero ────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-brand-100/40 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-20 right-1/4 w-64 h-64 bg-brand-50 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-6xl mx-auto px-5 py-16 lg:py-24 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">

          {/* Left */}
          <div>
            <motion.div {...up(0)} className="inline-flex items-center gap-2 bg-brand-50 border border-brand-200 text-brand-600 text-xs font-bold px-3 py-1.5 rounded-full mb-6">
              <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-pulse" />
              For Malaysian Students
            </motion.div>

            <motion.h1 {...up(0.05)} className="font-display text-4xl sm:text-5xl lg:text-[3.25rem] font-extrabold text-heading leading-[1.1] mb-5">
              Automate Your{' '}
              <span className="text-brand-600">NILAM</span>
              <br />Submissions.
            </motion.h1>

            <motion.p {...up(0.1)} className="text-body text-lg leading-relaxed mb-8 max-w-md">
              Nilam Auto submits your reading records on{' '}
              <span className="text-heading font-semibold">ains.moe.gov.my</span>{' '}
              automatically every month — so you never miss a deadline.
            </motion.p>

            <motion.div {...up(0.15)} className="flex flex-col sm:flex-row gap-3 mb-10">
              <button
                onClick={() => { setMode('signup'); document.getElementById('auth')?.scrollIntoView({ behavior: 'smooth' }) }}
                className="btn-primary text-base px-8 py-3.5"
              >
                Get Started Free
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
              </button>
              <button
                onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })}
                className="btn-ghost text-base"
              >
                How it works
              </button>
            </motion.div>

            <motion.div {...up(0.2)} className="flex gap-8 flex-wrap border-t border-line pt-6">
              {[
                { v: '1,000+', l: 'Malaysian students' },
                { v: 'Up to 50', l: 'books / month' },
                { v: '< 2 min', l: 'setup time' },
              ].map(s => (
                <div key={s.l}>
                  <p className="font-display font-bold text-xl text-heading">{s.v}</p>
                  <p className="text-xs text-muted mt-0.5">{s.l}</p>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right: Phone mockup */}
          <div className="lg:pl-4">
            <PhoneMockup />
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────── */}
      <section id="how" className="py-20 border-t border-line bg-white">
        <div className="max-w-6xl mx-auto px-5">
          <motion.div {...inView()} className="text-center mb-14">
            <p className="text-brand-600 text-xs font-bold uppercase tracking-widest mb-3">How it works</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-heading">
              3 steps. Automatically forever.
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {[
              {
                n: '1',
                title: 'Create Account',
                desc: 'Sign up with your email, verify it, then log in to your Nilam Auto dashboard.',
                icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
              },
              {
                n: '2',
                title: 'Log In to AINS',
                desc: 'Click "Connect & Submit" — complete your AINS login (including any 2FA). We capture your session securely.',
                icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
              },
              {
                n: '3',
                title: 'Relax',
                desc: 'Nilam Auto logs in to AINS and submits your records automatically every month.',
                icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              },
            ].map((step, i) => (
              <motion.div key={step.n} {...inView(i * 0.08)} className="flex flex-col items-center text-center">
                <div className="w-14 h-14 bg-brand-600 text-white rounded-2xl flex items-center justify-center mb-4 shadow-card">
                  {step.icon}
                </div>
                <div className="w-7 h-7 bg-brand-50 text-brand-600 rounded-full flex items-center justify-center text-xs font-bold mb-3">
                  {step.n}
                </div>
                <h3 className="font-display text-lg font-bold text-heading mb-2">{step.title}</h3>
                <p className="text-muted text-sm leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Full Guide ───────────────────────────────── */}
      <section id="guide" className="py-20 border-t border-line bg-page">
        <div className="max-w-4xl mx-auto px-5">
          <motion.div {...inView()} className="text-center mb-14">
            <p className="text-brand-600 text-xs font-bold uppercase tracking-widest mb-3">Step-by-step guide</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-heading">
              Set up in under 2 minutes
            </h2>
            <p className="text-muted text-base mt-3">Works on any browser, any device — no extension needed.</p>
          </motion.div>

          <div className="space-y-4">
            {[
              {
                n: '1',
                label: 'Create your account',
                body: 'Click "Get Started Free", enter your email and a password, then check your inbox for a verification email. Click the link to activate your account.',
                tip: 'Use your personal email (Gmail, Outlook etc) — not your school email which may block automated emails.',
              },
              {
                n: '2',
                label: 'Choose your preferences',
                body: 'Log in and go to Settings. Choose your language (Malay, English, Chinese, or Tamil), number of books per month (1–8), and pick a schedule day for the auto-run.',
              },
              {
                n: '3',
                label: 'Connect your AINS account',
                body: 'On the Dashboard, click "Connect AINS Account". Enter your AINS email and password — we use them to log in and capture your session, then discard the password immediately. Your encrypted session is stored securely.',
                tip: 'Your AINS session is encrypted with AES-256. Sessions last about 30 days — you\'ll get a reminder when it\'s time to reconnect.',
              },
              {
                n: '4',
                label: 'Get reminded — then submit in one tap',
                body: 'On your chosen day each month, we send you an email reminder. Open the app, tap Submit Now, and your records are submitted in under a minute. Check History anytime to see what was submitted.',
              },
            ].map((step, i) => (
              <motion.div key={step.n} {...inView(i * 0.05)} className="flex gap-5 bg-white rounded-2xl border border-line p-5 hover:border-brand-200 transition-colors">
                <div className="w-9 h-9 bg-brand-600 text-white rounded-xl flex items-center justify-center text-sm font-extrabold flex-shrink-0 mt-0.5 shadow-sm">
                  {step.n}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-display font-bold text-heading mb-1.5">{step.label}</p>
                  <p className="text-sm text-muted leading-relaxed">{step.body}</p>
                  {step.tip && (
                    <div className="flex items-start gap-2 mt-3 bg-brand-50 border border-brand-100 rounded-xl px-3 py-2">
                      <span className="text-brand-500 text-xs mt-0.5 flex-shrink-0">💡</span>
                      <p className="text-xs text-brand-700 leading-relaxed">{step.tip}</p>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>

          <motion.div {...inView(0.1)} className="mt-10 text-center">
            <button
              onClick={() => { setMode('signup'); document.getElementById('auth')?.scrollIntoView({ behavior: 'smooth' }) }}
              className="btn-primary text-base px-8 py-3.5"
            >
              Get Started Free — takes 2 minutes
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
            </button>
          </motion.div>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────── */}
      <section className="py-20 border-t border-line bg-page">
        <div className="max-w-6xl mx-auto px-5">
          <motion.div {...inView()} className="text-center mb-12">
            <p className="text-brand-600 text-xs font-bold uppercase tracking-widest mb-3">Pricing</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-heading">Simple, honest pricing.</h2>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
            {/* Free */}
            <motion.div {...inView(0)} className="card-p">
              <p className="text-muted font-bold text-sm mb-1">Free</p>
              <p className="font-display text-4xl font-extrabold text-heading mb-1">RM0</p>
              <p className="text-subtle text-xs mb-5">Forever free</p>
              <ul className="space-y-2.5 mb-6">
                {['1 book / week', '1 language', '7-day history', 'Manual submit only'].map(f => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-muted">
                    <svg className="w-4 h-4 text-subtle flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => { setMode('signup'); document.getElementById('auth')?.scrollIntoView({ behavior: 'smooth' }) }}
                className="btn-ghost w-full"
              >
                Get started
              </button>
            </motion.div>

            {/* Pro */}
            <motion.div {...inView(0.08)} className="bg-brand-600 rounded-card p-6 relative overflow-hidden">
              <div className="absolute -right-8 -top-8 w-32 h-32 bg-white/5 rounded-full pointer-events-none" />
              <div className="relative">
                <div className="inline-flex items-center gap-1.5 bg-white/20 text-white text-xs font-bold px-2.5 py-1 rounded-full mb-3">
                  Most Popular
                </div>
                <p className="text-brand-200 font-bold text-sm mb-1">Pro</p>
                <p className="font-display text-4xl font-extrabold text-white mb-1">RM18</p>
                <p className="text-brand-200 text-xs mb-5">/ year · ≈ RM1.50/month</p>
                <ul className="space-y-2.5 mb-6">
                  {['Up to 50 books / month', 'All 4 languages', 'Full history', 'Monthly email reminder (coming soon)', 'Priority support'].map(f => (
                    <li key={f} className="flex items-center gap-2.5 text-sm text-white">
                      <svg className="w-4 h-4 text-brand-200 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => navigate('/upgrade')}
                  className="w-full py-3 bg-white text-brand-600 font-bold rounded-xl hover:bg-brand-50 transition-colors"
                >
                  Unlock Pro — RM18 / Year
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Auth ─────────────────────────────────────── */}
      <section id="auth" className="py-20 border-t border-line bg-white">
        <div className="max-w-md mx-auto px-5">
          <motion.div {...inView()} className="text-center mb-8">
            <h2 className="font-display text-3xl font-bold text-heading">
              {mode === 'login' ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="text-muted text-sm mt-2">
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <button
                onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage(''); setAgreedToTerms(false) }}
                className="text-brand-600 font-semibold hover:underline"
              >
                {mode === 'login' ? 'Sign up free' : 'Sign in'}
              </button>
            </p>
          </motion.div>

          <motion.div {...inView(0.05)} className="card-p">
            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-6">
              {[{ k: 'login', l: 'Sign In' }, { k: 'signup', l: 'Sign Up' }].map(t => (
                <button
                  key={t.k}
                  onClick={() => { setMode(t.k); setMessage(''); setAgreedToTerms(false) }}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                    mode === t.k ? 'bg-white text-heading shadow-sm' : 'text-muted hover:text-heading'
                  }`}
                >
                  {t.l}
                </button>
              ))}
            </div>

            <form onSubmit={handleAuth} className="space-y-4">
              <div>
                <label className="label">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="student@school.edu.my"
                  required
                  className="input"
                />
              </div>
              <div>
                <label className="label">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="input"
                />
              </div>

              {message && (
                <p className={`text-sm font-semibold ${isError ? 'text-danger-600' : 'text-ok-600'}`}>
                  {message}
                </p>
              )}

              {mode === 'signup' && (
                <div className="flex items-start gap-2.5">
                  <input
                    id="agree-terms"
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={e => setAgreedToTerms(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-line accent-brand-600 cursor-pointer flex-shrink-0"
                  />
                  <label htmlFor="agree-terms" className="text-xs text-muted leading-relaxed cursor-pointer">
                    I have read and agree to the{' '}
                    <Link to="/terms" target="_blank" className="text-brand-600 font-semibold hover:underline">Terms of Use</Link>
                    {' '}and{' '}
                    <Link to="/privacy" target="_blank" className="text-brand-600 font-semibold hover:underline">Privacy Policy</Link>.
                    I understand my AINS session will be used to automate my reading record submissions.
                  </label>
                </div>
              )}

              <button type="submit" disabled={loading || (mode === 'signup' && !agreedToTerms)} className="btn-primary w-full py-3">
                {loading ? (
                  <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Processing…</>
                ) : mode === 'login' ? 'Sign In' : 'Create Account'}
              </button>

              <p className="text-center text-xs text-subtle leading-relaxed">
                By {mode === 'login' ? 'signing in' : 'creating an account'}, you agree to our{' '}
                <Link to="/terms" target="_blank" className="underline hover:text-muted transition-colors">Terms of Use</Link>
                {' '}and acknowledge our{' '}
                <Link to="/privacy" target="_blank" className="underline hover:text-muted transition-colors">Privacy Policy</Link>.
              </p>
            </form>

            <div className="mt-4 pt-4 border-t border-line text-center">
              <p className="text-xs text-muted mb-2">Didn't receive your verification email?</p>
              <button
                type="button"
                onClick={handleResend}
                disabled={resending || resent}
                className="text-sm font-semibold text-brand-600 hover:underline disabled:opacity-50 disabled:no-underline"
              >
                {resending ? 'Sending…' : resent ? 'Email sent ✓' : 'Resend verification email'}
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────── */}
      <footer className="bg-heading text-white py-10 border-t border-white/10">
        <div className="max-w-6xl mx-auto px-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-brand-600 rounded-lg flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </div>
            <span className="font-display font-bold text-sm">Nilam Auto</span>
          </div>
          <p className="text-white/40 text-xs">© 2026 Nilam Auto. Built for Malaysian students.</p>
          <div className="flex items-center gap-4">
            <Link to="/terms" className="text-white/40 text-xs hover:text-white/70 transition-colors">Terms of Use</Link>
            <Link to="/privacy" className="text-white/40 text-xs hover:text-white/70 transition-colors">Privacy Policy</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
