const express = require('express')
const router = express.Router()
const crypto = require('crypto')
const supabase = require('../lib/supabase')
const { encrypt, decrypt } = require('../lib/crypto')
const { requireAuth, isAdminEmail } = require('../lib/auth-middleware')
const sm = require('../lib/session-manager')

// In-memory login state per user
// status: 'connecting' | 'waiting_mfa' | 'success' | 'error'
const loginState = {}

// POST /api/auth/connect
// Starts a silent Playwright login flow server-side. Returns immediately; poll /connect-status for progress.
// Body: { email, password, targetUserId? } — targetUserId is admin-only: connect AINS for another user.
router.post('/connect', requireAuth, async (req, res) => {
  const { email, password, targetUserId } = req.body

  // Admin can pass targetUserId to connect AINS on behalf of another user
  let userId = req.authUser.id
  if (targetUserId && targetUserId !== userId) {
    if (!isAdminEmail(req.authUser.email)) {
      return res.status(403).json({ error: 'Only admins can connect AINS for other users' })
    }
    userId = targetUserId
  }

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' })
  }

  // If a login is already in progress for this user, reject
  if (loginState[userId]?.status === 'connecting' || loginState[userId]?.status === 'waiting_mfa') {
    return res.status(409).json({ error: 'Login already in progress' })
  }

  loginState[userId] = { status: 'connecting' }
  res.json({ status: 'connecting' })

  // Run login flow asynchronously — client polls /connect-status
  ;(async () => {
    try {
      const { ssToken, ssUser, ssProfile, cookies } = await sm.performLogin(
        userId,
        email,
        password,
        (status, data = {}) => { loginState[userId] = { status, ...data } }
      )

      // One AINS per account: check uniqueness via sha256 of ssUser identifier
      if (ssUser) {
        try {
          const parsed = JSON.parse(ssUser)
          const ainsId = parsed?.id || parsed?.userId || parsed?.username || parsed?.ic || null
          if (ainsId) {
            const hash = crypto.createHash('sha256').update(String(ainsId)).digest('hex')

            const { data: conflict } = await supabase
              .from('users')
              .select('id')
              .eq('ains_user_id_hash', hash)
              .neq('id', userId)
              .maybeSingle()

            if (conflict) {
              loginState[userId] = { status: 'error', message: 'This AINS account is already connected to another Nilam Auto account.' }
              return
            }

            await supabase.from('users').update({ ains_user_id_hash: hash }).eq('id', userId).catch(() => {})
          }
        } catch (e) {
          console.warn('[auth] Could not parse ssUser for uniqueness check:', e.message)
        }
      }

      // Build and encrypt session data
      const sessionData = JSON.stringify({
        ssToken,
        ssUser,
        ssProfile,
        cookies: cookies.map(c => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path || '/',
          httpOnly: c.httpOnly || false,
          secure: c.secure || false,
          sameSite: 
            (c.sameSite && c.sameSite.toLowerCase() === 'no_restriction') ? 'None'
          : (c.sameSite && c.sameSite.toLowerCase() === 'none') ? 'None'
          : (c.sameSite && c.sameSite.toLowerCase() === 'strict') ? 'Strict'
          : 'Lax',
          expires: c.expirationDate || -1,
        }))
      })

      const encrypted = encrypt(sessionData)
      const encryptedEmail = encrypt(email)
      const encryptedPassword = encrypt(password)

      const { error } = await supabase
        .from('users')
        .update({
          ains_cookie_encrypted: encrypted,
          ains_email_encrypted: encryptedEmail,
          ains_password_encrypted: encryptedPassword,
        })
        .eq('id', userId)

      if (error) {
        console.error('[auth] Failed to save session:', error.message)
        loginState[userId] = { status: 'error', message: 'Failed to save credentials. Please try again.' }
        return
      }

      loginState[userId] = { status: 'success' }
    } catch (err) {
      console.error('[auth] Login flow failed:', err.message)
      loginState[userId] = { status: 'error', message: err.message }
    }
  })()
})

// GET /api/auth/connect-status
// Returns current login flow status for the authenticated user.
// Clears state after returning success or error (one-shot).
router.get('/connect-status', requireAuth, (req, res) => {
  const userId = req.authUser.id
  const state = loginState[userId] || { status: 'idle' }

  if (state.status === 'success' || state.status === 'error') {
    delete loginState[userId]
  }

  res.json(state)
})

// POST /api/auth/cancel-connect
// Cancels an in-progress login flow and destroys the Playwright session.
router.post('/cancel-connect', requireAuth, async (req, res) => {
  const userId = req.authUser.id
  await sm.destroySession(userId).catch(() => {})
  delete loginState[userId]
  res.json({ success: true })
})

// GET /api/auth/saved-email
// Returns the decrypted saved AINS email for the user (for pre-filling the form on reconnect).
router.get('/saved-email', requireAuth, async (req, res) => {
  const userId = req.authUser.id

  try {
    const { data } = await supabase
      .from('users')
      .select('ains_email_encrypted')
      .eq('id', userId)
      .single()

    if (data?.ains_email_encrypted) {
      const email = decrypt(data.ains_email_encrypted)
      return res.json({ email })
    }
    res.json({ email: '' })
  } catch {
    res.json({ email: '' })
  }
})

// POST /api/auth/register
// Body: { id, email, delima_id }
router.post('/register', requireAuth, async (req, res) => {
  const { id, email, delima_id } = req.body

  if (!id || !email) {
    return res.status(400).json({ error: 'id and email are required' })
  }

  // Users can only register themselves
  if (id !== req.authUser.id) {
    return res.status(403).json({ error: 'Access denied' })
  }

  try {
    const isAdmin = isAdminEmail(email)

    const { data, error } = await supabase
      .from('users')
      .upsert({ id, email, delima_id, is_active: isAdmin }, { onConflict: 'id' })
      .select()
      .single()

    if (error) return res.status(500).json({ error: 'Registration failed. Please try again.' })

    res.json({ success: true, user: data })
  } catch {
    res.status(500).json({ error: 'Registration failed. Please try again.' })
  }
})

module.exports = router
