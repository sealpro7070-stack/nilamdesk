import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

// targetUserId — admin-only prop to connect AINS on behalf of another user
export default function ConnectAINSModal({ isOpen, onClose, onSuccess, targetUserId }) {
  const [phase, setPhase] = useState('form') // 'form' | 'connecting' | 'waiting_mfa' | 'success' | 'error'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [mfaNumber, setMfaNumber] = useState(null)
  const pollRef = useRef(null)
  const activeRef = useRef(false)

  const stopPolling = () => {
    if (pollRef._visCleanup) { pollRef._visCleanup(); pollRef._visCleanup = null }
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token || ''
  }

  const cancelConnect = async () => {
    stopPolling()
    const token = await getToken()
    fetch(`${BACKEND}/api/auth/cancel-connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    }).catch(() => {})
  }

  const checkStatus = async () => {
    if (!activeRef.current) return
    try {
      const pollToken = await getToken()
      const statusRes = await fetch(`${BACKEND}/api/auth/connect-status`, {
        headers: { 'Authorization': `Bearer ${pollToken}` },
      })
      const data = await statusRes.json()
      if (!activeRef.current) return

      if (data.status === 'waiting_mfa') {
        setMfaNumber(data.mfaNumber || null)
        setPhase('waiting_mfa')
      } else if (data.status === 'success') {
        stopPolling()
        setPhase('success')
        setTimeout(() => { onSuccess(); onClose() }, 1500)
      } else if (data.status === 'error') {
        stopPolling()
        setPhase('error')
        setErrorMsg(data.message || 'Login failed. Please try again.')
      }
    } catch {
      // network hiccup — keep polling
    }
  }

  // Load saved email on open
  useEffect(() => {
    if (!isOpen) return
    activeRef.current = true
    setPhase('form')
    setErrorMsg('')
    setPassword('')

    ;(async () => {
      const token = await getToken()
      const res = await fetch(`${BACKEND}/api/auth/saved-email`, {
        headers: { 'Authorization': `Bearer ${token}` },
      }).catch(() => null)
      if (!activeRef.current) return
      if (res?.ok) {
        const data = await res.json()
        if (data.email) setEmail(data.email)
      }
    })()

    return () => {
      activeRef.current = false
      stopPolling()
    }
  }, [isOpen])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) return

    setPhase('connecting')
    setErrorMsg('')

    const token = await getToken()

    // Fire the silent login
    const body = { email: email.trim(), password }
    if (targetUserId) body.targetUserId = targetUserId
    const res = await fetch(`${BACKEND}/api/auth/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(body),
    }).catch(() => null)

    if (!res?.ok) {
      const data = await res?.json().catch(() => ({}))
      setPhase('error')
      setErrorMsg(data?.error || 'Connection failed. Please try again.')
      return
    }

    // Poll for status every 2s
    pollRef.current = setInterval(checkStatus, 2000)

    // On mobile (iOS), setInterval freezes when the tab goes to background.
    // When the user switches to their authenticator app and comes back,
    // fire an immediate check so they don't wait for the next interval tick.
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkStatus()
    }
    document.addEventListener('visibilitychange', onVisible)
    // Store cleanup ref so we can remove the listener when modal closes
    pollRef._visCleanup = () => document.removeEventListener('visibilitychange', onVisible)
  }

  const handleTryAgain = () => {
    setPhase('form')
    setPassword('')
    setErrorMsg('')
  }

  const handleClose = async () => {
    if (phase === 'connecting' || phase === 'waiting_mfa') {
      await cancelConnect()
    }
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <motion.div
        initial={{ opacity: 0, y: 60, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="bg-white sm:rounded-2xl w-full sm:max-w-md shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: '95dvh' }}
      >
        {/* Header */}
        <div className="bg-brand-600 text-white p-4 flex items-center justify-between flex-shrink-0">
          <h3 className="font-bold text-sm sm:text-base">Connect your AINS Account</h3>
          <button onClick={handleClose} className="text-white/60 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="p-5 sm:p-6 space-y-4">
          {/* Form phase */}
          {phase === 'form' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="bg-brand-50 border border-brand-200 rounded-lg p-3">
                <p className="text-sm text-brand-800">
                  Enter your AINS (DELIMa) login details. After clicking Connect,
                  approve the notification on your phone, then switch back here.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-heading mb-1">AINS Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="yourname@moe.gov.my"
                    required
                    autoComplete="email"
                    className="w-full border border-line rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-heading mb-1">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Your AINS password"
                    required
                    autoComplete="current-password"
                    className="w-full border border-line rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={!email.trim() || !password.trim()}
                className="w-full py-2.5 bg-brand-600 text-white rounded-xl font-bold text-sm hover:bg-brand-700 disabled:opacity-40 transition-colors"
              >
                Connect
              </button>

              <button type="button" onClick={handleClose} className="w-full py-2.5 rounded-xl border border-line text-muted font-bold hover:bg-gray-50 transition-colors text-sm">
                Cancel
              </button>
            </form>
          )}

          {/* Connecting phase */}
          {phase === 'connecting' && (
            <div className="py-6 text-center space-y-4">
              <div className="w-10 h-10 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <div>
                <p className="font-semibold text-heading">Signing in to AINS...</p>
                <p className="text-sm text-muted mt-1">Please wait while we set up your connection.</p>
              </div>
              <button onClick={handleClose} className="w-full py-2.5 rounded-xl border border-line text-muted font-bold hover:bg-gray-50 transition-colors text-sm">
                Cancel
              </button>
            </div>
          )}

          {/* Waiting for MFA phase */}
          {phase === 'waiting_mfa' && (
            <div className="py-6 text-center space-y-4">
              <div className="text-4xl">📱</div>
              {mfaNumber ? (
                <div>
                  <p className="font-semibold text-heading text-lg">Check your phone</p>
                  <p className="text-sm text-muted mt-1 mb-3">
                    Tap the number below in your Google app to verify:
                  </p>
                  <div className="inline-block bg-brand-600 text-white text-5xl font-bold rounded-2xl px-8 py-4 tracking-widest shadow-lg">
                    {mfaNumber}
                  </div>
                </div>
              ) : (
                <div>
                  <p className="font-semibold text-heading text-lg">Check your phone</p>
                  <p className="text-sm text-muted mt-1">
                    Approve the sign-in notification on your phone to continue.
                  </p>
                </div>
              )}
              <div className="w-6 h-6 border-2 border-brand-400 border-t-transparent rounded-full animate-spin mx-auto" />
              <button onClick={handleClose} className="w-full py-2.5 rounded-xl border border-line text-muted font-bold hover:bg-gray-50 transition-colors text-sm">
                Cancel
              </button>
            </div>
          )}

          {/* Success phase */}
          {phase === 'success' && (
            <div className="py-8 text-center space-y-3">
              <div className="text-5xl">✓</div>
              <p className="font-bold text-heading text-lg">AINS Connected!</p>
              <p className="text-sm text-muted">Your account is ready. Closing...</p>
            </div>
          )}

          {/* Error phase */}
          {phase === 'error' && (
            <div className="space-y-4">
              <div className="bg-danger-50 border border-danger-200 rounded-lg p-4 text-center">
                <p className="text-danger-700 font-semibold text-sm mb-1">Connection failed</p>
                <p className="text-danger-600 text-sm">{errorMsg}</p>
              </div>
              <button
                onClick={handleTryAgain}
                className="w-full py-2.5 bg-brand-600 text-white rounded-xl font-bold text-sm hover:bg-brand-700 transition-colors"
              >
                Try Again
              </button>
              <button onClick={handleClose} className="w-full py-2.5 rounded-xl border border-line text-muted font-bold hover:bg-gray-50 transition-colors text-sm">
                Cancel
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
