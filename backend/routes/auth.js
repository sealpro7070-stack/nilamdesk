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
const connectLocks = new Map()

async function withConnectLock(userId, fn) {
  while (connectLocks.has(userId)) {
    try { await connectLocks.get(userId) } catch {}
  }
  let resolve
  const promise = new Promise(r => { resolve = r })
  connectLocks.set(userId, promise)
  try {
    return await fn()
  } finally {
    connectLocks.delete(userId)
    resolve()
  }
}

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

  // Rate limit: max 5 connection attempts per user per hour.
  // Admins are exempt so they aren't locked out while connecting/testing client accounts.
  const { checkRateLimit } = require('../lib/auth-middleware')
  if (!isAdminEmail(req.authUser.email) && !checkRateLimit(`ains-connect:${userId}`, 5, 3600000)) {
    return res.status(429).json({ error: 'Too many connection attempts. Please wait before trying again.' })
  }

  // Atomic connect lock: prevents race-condition double browser spawn
  if (connectLocks.has(userId)) {
    return res.status(409).json({ error: 'Login already in progress' })
  }

  loginState[userId] = { status: 'connecting' }
  res.json({ status: 'connecting' })

  // Run login flow asynchronously — client polls /connect-status
  await withConnectLock(userId, async () => {
    // Hard timeout: if login doesn't complete in 3 minutes, give up
    const loginTimeout = setTimeout(() => {
      if (loginState[userId]?.status === 'connecting' || loginState[userId]?.status === 'waiting_mfa') {
        console.error('[auth] Login flow timed out for', userId)
        loginState[userId] = { status: 'error', message: 'Sign-in timed out. Make sure you approve the notification on your phone within 3 minutes, then try again.' }
        sm.destroySession(userId).catch(() => {})
      }
    }, 3 * 60 * 1000)

    try {
      // Clear any stale session so every reconnect starts completely fresh
      const { error: clearErr } = await supabase.from('users').update({ ains_cookie_encrypted: null }).eq('id', userId)
      if (clearErr) console.error('[auth] Failed to clear stale session:', clearErr.message)

      const { ssToken, ssUser, ssProfile, cookies } = await sm.performLogin(
        userId,
        email,
        password,
        (status, data = {}) => { loginState[userId] = { status, ...data } }
      )

      // One AINS per account: check uniqueness via sha256 of ssUser identifier
      // Admins bypass this check so they can test with any account
      const isConnectingAdmin = isAdminEmail(req.authUser.email)
      if (ssUser && !isConnectingAdmin) {
        try {
          const parsed = JSON.parse(ssUser)
          const ainsId = parsed?.id || parsed?.userId || parsed?.username || parsed?.ic || null
          if (ainsId) {
            const hash = crypto.createHash('sha256').update(String(ainsId)).digest('hex')

            const { data: userConflict } = await supabase
              .from('users')
              .select('id')
              .eq('ains_user_id_hash', hash)
              .neq('id', userId)
              .maybeSingle()

            const { data: slotConflict } = await supabase
              .from('family_slots')
              .select('id')
              .eq('ains_user_id_hash', hash)
              .maybeSingle()

            if (userConflict || slotConflict) {
              loginState[userId] = { status: 'error', message: 'This AINS account is already connected to another NilamDesk account or slot.' }
              return
            }

            const { error: hashErr } = await supabase.from('users').update({ ains_user_id_hash: hash }).eq('id', userId)
            if (hashErr) console.error('[auth] Failed to save ains_user_id_hash:', hashErr.message)
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

      const encrypted = encrypt(sessionData, userId)
      const encryptedEmail = encrypt(email, userId)

      const { error } = await supabase
        .from('users')
        .update({
          ains_cookie_encrypted: encrypted,
          ains_email_encrypted: encryptedEmail,
        })
        .eq('id', userId)

      if (error) {
        console.error('[auth] Failed to save session:', error.message)
        loginState[userId] = { status: 'error', message: 'Failed to save credentials. Please try again.' }
        return
      }

      loginState[userId] = { status: 'success' }
      clearTimeout(loginTimeout)
    } catch (err) {
      console.error('[auth] Login flow failed:', err.message)
      clearTimeout(loginTimeout)
      loginState[userId] = { status: 'error', message: 'Login failed. Please check your AINS email and password and try again.' }
    }
    // Auto-cleanup: if client never polls for the result, remove after 10 minutes
    setTimeout(() => { delete loginState[userId] }, 10 * 60 * 1000)
  })
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
      const email = decrypt(data.ains_email_encrypted, userId)
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
  const { id, email, delima_id, referred_by } = req.body

  if (!id || !email) {
    return res.status(400).json({ error: 'id and email are required' })
  }

  // Users can only register themselves
  if (id !== req.authUser.id) {
    return res.status(403).json({ error: 'Access denied' })
  }

  try {
    const isAdmin = isAdminEmail(req.authUser.email)

    // Validate referral code (only attach a real, active code).
    // The upsert below ignores duplicates, so referred_by is only ever set
    // when the row is first created — it can never be changed later.
    let refCode = null
    if (referred_by && typeof referred_by === 'string') {
      const code = referred_by.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 32)
      if (code) {
        const { data: rc } = await supabase
          .from('referral_codes')
          .select('code, active')
          .eq('code', code)
          .maybeSingle()
        if (rc && rc.active) refCode = rc.code
      }
    }

    // register() is called on EVERY login. It must NOT clobber existing state
    // (plan, credits, is_active) — doing so previously deactivated paid users
    // on every sign-in. Insert defaults only for brand-new users; never update
    // an existing row's plan/credits/activation here.
    const insertPayload = { id, email, is_active: isAdmin, credits: 1 }
    if (delima_id) insertPayload.delima_id = delima_id
    if (refCode) insertPayload.referred_by = refCode

    const { error: insertErr } = await supabase
      .from('users')
      .upsert(insertPayload, { onConflict: 'id', ignoreDuplicates: true })

    if (insertErr) return res.status(500).json({ error: 'Registration failed. Please try again.' })

    // The auth.users -> public.users trigger may have already created the row,
    // which makes the ignoreDuplicates upsert above a no-op. Attach the referral
    // code here as a separate, idempotent step: set it ONLY when still null, so
    // it lands on first sign-up and is never overwritten on later logins.
    if (refCode) {
      await supabase
        .from('users')
        .update({ referred_by: refCode })
        .eq('id', id)
        .is('referred_by', null)
    }

    // Return the current row (existing or just-created), untouched.
    const { data, error } = await supabase
      .from('users')
      .select()
      .eq('id', id)
      .single()

    if (error) return res.status(500).json({ error: 'Registration failed. Please try again.' })

    res.json({ success: true, user: data })
  } catch {
    res.status(500).json({ error: 'Registration failed. Please try again.' })
  }
})

module.exports = router
