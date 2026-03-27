import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

export default function ConnectAINSModal({ userId, isOpen, onClose, onSuccess }) {
  const [screenshot, setScreenshot] = useState(null)
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState('Initializing...')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mobileInput, setMobileInput] = useState('')
  const [isMobile] = useState(() => window.innerWidth < 768 || 'ontouchstart' in window)
  const canvasRef = useRef(null)
  const pollIntervalRef = useRef(null)
  const mobileInputRef = useRef(null)

  // Draw screenshot onto canvas whenever it updates
  useEffect(() => {
    if (!screenshot || !canvasRef.current) return
    const img = new Image()
    img.onload = () => {
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx) ctx.drawImage(img, 0, 0, 1280, 800)
    }
    img.src = `data:image/png;base64,${screenshot}`
  }, [screenshot])

  // Initialize session and start polling
  useEffect(() => {
    if (!isOpen) return

    const init = async () => {
      try {
        setError('')
        setStatus('Starting AINS login session...')
        const res = await fetch(`${BACKEND}/api/auth/start-login-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId })
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)

        setScreenshot(data.screenshot)
        setUrl(data.url)
        setStatus('Ready. Log in to your AINS account.')
        setLoading(false)

        // Start polling for login status
        startStatusPolling()
      } catch (err) {
        setError(err.message)
        setLoading(false)
      }
    }

    init()

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
      // Cleanup session on unmount
      fetch(`${BACKEND}/api/auth/cancel-login-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      }).catch(() => {})
    }
  }, [isOpen, userId])

  const startStatusPolling = () => {
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${BACKEND}/api/auth/check-login-status?userId=${userId}`)
        const data = await res.json()

        if (data.screenshot) setScreenshot(data.screenshot)
        if (data.url) setUrl(data.url)
        if (data.message) setStatus(data.message)

        if (data.loggedIn) {
          // Success!
          clearInterval(pollIntervalRef.current)
          setStatus('✓ AINS connected! Closing...')
          setTimeout(() => {
            onSuccess()
            onClose()
          }, 1000)
        }
      } catch (err) {
        console.error('[modal] Status check failed:', err)
      }
    }, 2000)
  }

  const handleInputClick = async (clientX, clientY) => {
    if (!screenshot || loading) return

    try {
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const scaleX = 1280 / rect.width
      const scaleY = 800 / rect.height
      const x = Math.round((clientX - rect.left) * scaleX)
      const y = Math.round((clientY - rect.top) * scaleY)

      setStatus(`Clicking at (${x}, ${y})...`)
      const res = await fetch(`${BACKEND}/api/auth/send-input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, type: 'clickAt', x, y })
      })
      const data = await res.json()
      if (!res.ok) {
        setStatus(`Click failed: ${data.error || 'Unknown error'}`)
        return
      }
      if (data.screenshot) setScreenshot(data.screenshot)
      if (data.url) setUrl(data.url)
      setStatus('Ready. Continue logging in.')
      // On mobile, focus the input bar after a click so keyboard appears
      if (isMobile && mobileInputRef.current) {
        setTimeout(() => mobileInputRef.current?.focus(), 100)
      }
    } catch (err) {
      setError(err.message)
    }
  }

  const sendMobileInput = async () => {
    if (!mobileInput.trim() && mobileInput !== '') return
    const text = mobileInput
    setMobileInput('')
    if (!text) return
    try {
      setStatus('Sending...')
      await fetch(`${BACKEND}/api/auth/send-input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, type: 'type', text })
      })
      const res = await fetch(`${BACKEND}/api/auth/get-screenshot?userId=${userId}`)
      const data = await res.json()
      if (data.screenshot) setScreenshot(data.screenshot)
      if (data.url) setUrl(data.url)
      setStatus('Ready. Continue logging in.')
    } catch (err) {
      setError(err.message)
    }
  }

  const sendMobileKey = async (key) => {
    try {
      setStatus('Sending...')
      const res = await fetch(`${BACKEND}/api/auth/send-input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, type: 'key', key })
      })
      const data = await res.json()
      if (data.screenshot) setScreenshot(data.screenshot)
      if (data.url) setUrl(data.url)
      setStatus('Ready. Continue logging in.')
    } catch (err) {
      setError(err.message)
    }
  }

  // Buffer for batching typed characters
  const typeBufferRef = useRef('')
  const flushTimerRef = useRef(null)

  const flushTypeBuffer = useCallback(async () => {
    const text = typeBufferRef.current
    typeBufferRef.current = ''
    if (!text) return

    try {
      await fetch(`${BACKEND}/api/auth/send-input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, type: 'type', text })
      })
    } catch {}
  }, [userId])

  const sendKeyAndRefresh = async (key) => {
    try {
      setStatus('Sending...')
      const res = await fetch(`${BACKEND}/api/auth/send-input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, type: 'key', key })
      })
      const data = await res.json()
      if (data.screenshot) setScreenshot(data.screenshot)
      if (data.url) setUrl(data.url)
      setStatus('Ready. Continue logging in.')
    } catch (err) {
      setError(err.message)
    }
  }

  const handleKeydown = async (e) => {
    if (!screenshot || loading || e.target.tagName === 'INPUT') return
    e.preventDefault()

    const specialKeys = ['Enter', 'Tab', 'Backspace', 'Delete', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']

    if (specialKeys.includes(e.key)) {
      // Flush any buffered text first, then send the special key
      if (typeBufferRef.current) await flushTypeBuffer()
      await sendKeyAndRefresh(e.key)
    } else if (e.key.length === 1) {
      // Buffer printable characters and flush after 300ms of no typing
      typeBufferRef.current += e.key
      setStatus(`Typing: ${typeBufferRef.current}`)
      clearTimeout(flushTimerRef.current)
      flushTimerRef.current = setTimeout(async () => {
        await flushTypeBuffer()
        // Refresh screenshot after flush
        try {
          const res = await fetch(`${BACKEND}/api/auth/get-screenshot?userId=${userId}`)
          const data = await res.json()
          if (data.screenshot) setScreenshot(data.screenshot)
          if (data.url) setUrl(data.url)
          setStatus('Ready. Continue logging in.')
        } catch {}
      }, 300)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <motion.div
        initial={{ opacity: 0, y: isMobile ? 60 : undefined, scale: isMobile ? 1 : 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="bg-white sm:rounded-2xl w-full sm:max-w-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: '95dvh' }}
      >
        {/* Header */}
        <div className="bg-brand-600 text-white p-4 flex items-center justify-between flex-shrink-0">
          <h3 className="font-bold text-sm sm:text-base">Connect your AINS Account</h3>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 p-4 sm:p-6 space-y-3 sm:space-y-4">
          {error && (
            <div className="bg-danger-50 border border-danger-200 rounded-lg p-3 text-danger-700 text-sm">
              {error}
            </div>
          )}

          {/* Instructions */}
          <div className="bg-brand-50 border border-brand-200 rounded-lg p-3">
            <p className="text-sm text-brand-800">
              <strong>Log in to AINS here:</strong>{' '}
              {isMobile
                ? 'Tap the screen to click a field, then type in the input bar below.'
                : 'Click on the screen below to interact with the login form. Use your DELIMa account (Google login, IC+password, or any method you normally use).'}
            </p>
          </div>

          {/* Screenshot display — horizontally scrollable on mobile so the form is usable */}
          <div className="border border-line rounded-lg overflow-hidden bg-gray-50">
            {loading ? (
              <div className="w-full h-56 sm:h-96 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-muted text-sm">Starting AINS...</p>
                </div>
              </div>
            ) : screenshot ? (
              <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: isMobile ? '45vw' : '400px' }}>
                <canvas
                  ref={canvasRef}
                  width={1280}
                  height={800}
                  onClick={e => handleInputClick(e.clientX, e.clientY)}
                  onKeyDown={handleKeydown}
                  tabIndex={0}
                  className="cursor-pointer border-0 block"
                  style={{
                    width: isMobile ? '640px' : '100%',
                    height: isMobile ? '400px' : 'auto',
                  }}
                />
              </div>
            ) : (
              <div className="w-full h-56 flex items-center justify-center text-muted">
                No screenshot available
              </div>
            )}
          </div>

          {/* Mobile: native input bar */}
          {isMobile && !loading && screenshot && (
            <div className="space-y-2">
              <p className="text-xs text-muted">Tap a field above, then type here:</p>
              <div className="flex gap-2">
                <input
                  ref={mobileInputRef}
                  type="text"
                  value={mobileInput}
                  onChange={e => setMobileInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sendMobileInput() } }}
                  placeholder="Type here..."
                  className="flex-1 border border-line rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
                <button
                  onClick={sendMobileInput}
                  disabled={!mobileInput}
                  className="px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-semibold disabled:opacity-40"
                >
                  Send
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => sendMobileKey('Enter')}
                  className="flex-1 py-2 border border-line rounded-xl text-xs font-semibold text-heading hover:bg-gray-50"
                >
                  ↵ Enter
                </button>
                <button
                  onClick={() => sendMobileKey('Tab')}
                  className="flex-1 py-2 border border-line rounded-xl text-xs font-semibold text-heading hover:bg-gray-50"
                >
                  ⇥ Tab
                </button>
                <button
                  onClick={() => sendMobileKey('Backspace')}
                  className="flex-1 py-2 border border-line rounded-xl text-xs font-semibold text-heading hover:bg-gray-50"
                >
                  ⌫ Delete
                </button>
              </div>
            </div>
          )}

          {/* Status */}
          <div>
            <p className="text-xs text-muted mb-1">Status:</p>
            <p className="text-sm font-semibold text-heading">{status}</p>
            {url && <p className="text-xs text-muted mt-1 break-all">{url}</p>}
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl border border-line text-muted font-bold hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  )
}
