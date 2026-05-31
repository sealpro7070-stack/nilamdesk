/**
 * family.js — Family plan slot management
 *
 * One family account can hold up to 3 AINS "slots" (one per child/sibling).
 * Each slot has its own AINS session, language preference, and submission history.
 * The parent user connects each slot's AINS account and triggers submissions.
 */

const express  = require('express')
const router   = express.Router()
const crypto   = require('crypto')
const supabase = require('../lib/supabase')
const { encrypt, decrypt } = require('../lib/crypto')
const { requireAuth, requireActive, checkRateLimit } = require('../lib/auth-middleware')
const sm       = require('../lib/session-manager')
const { startBotForSlot } = require('../bot/bot')

const MAX_SLOTS       = 3
const MAX_SLOT_NAME   = 100
const VALID_LANGUAGES = ['Melayu', 'Inggeris', 'Cina', 'Tamil']

// In-memory status store for slot connection flows (mirrors auth.js loginState pattern)
const slotConnectState = {}

// Evict stale slot connect states after 10 minutes to prevent memory leaks
function scheduleSlotCleanup(stateKey) {
  setTimeout(() => {
    const s = slotConnectState[stateKey]
    if (s && (s.status === 'success' || s.status === 'error')) {
      delete slotConnectState[stateKey]
    }
  }, 10 * 60 * 1000)
}

// Guard: must have an active family plan
async function requireFamily(req, res, next) {
  const { data: user, error: dbError } = await supabase
    .from('users')
    .select('plan, plan_expires_at, is_active')
    .eq('id', req.authUser.id)
    .single()

  if (dbError) return res.status(500).json({ error: 'Could not verify plan' })
  if (!user?.is_active) return res.status(403).json({ error: 'Account not activated' })

  const expired = user?.plan_expires_at && new Date(user.plan_expires_at) < new Date()
  if (user?.plan !== 'family' || expired) {
    return res.status(403).json({ error: 'Family plan required. Please upgrade to access this feature.' })
  }
  next()
}

// ── GET /api/family/slots
router.get('/slots', requireAuth, requireFamily, async (req, res) => {
  const { data, error } = await supabase
    .from('family_slots')
    .select('id, slot_name, language, books_per_month, created_at, ains_email_encrypted')
    .eq('user_id', req.authUser.id)
    .order('created_at')

  if (error) return res.status(500).json({ error: error.message })

  const slots = (data || []).map(s => {
    let email = null
    if (s.ains_email_encrypted) {
      try { email = decrypt(s.ains_email_encrypted, s.id) } catch {}
    }
    return {
      id:              s.id,
      slot_name:       s.slot_name,
      language:        s.language,
      books_per_month: s.books_per_month,
      created_at:      s.created_at,
      ains_connected:  !!s.ains_email_encrypted,
      ains_email:      email ? email.replace(/(.{2}).*(@.*)/, '$1***$2') : null,
    }
  })

  res.json({ slots })
})

// ── POST /api/family/slots
// Body: { slot_name }
router.post('/slots', requireAuth, requireFamily, async (req, res) => {
  const userId = req.authUser.id
  const { slot_name } = req.body

  if (!slot_name?.trim()) return res.status(400).json({ error: 'slot_name is required' })
  if (slot_name.trim().length > MAX_SLOT_NAME) return res.status(400).json({ error: `slot_name must be ${MAX_SLOT_NAME} characters or fewer` })

  const { count } = await supabase
    .from('family_slots')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (count >= MAX_SLOTS) {
    return res.status(400).json({ error: `Maximum ${MAX_SLOTS} slots allowed on the Family plan.` })
  }

  const { data, error } = await supabase
    .from('family_slots')
    .insert({ user_id: userId, slot_name: slot_name.trim() })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'A slot with that name already exists.' })
    return res.status(500).json({ error: error.message })
  }

  res.json({ success: true, slot: data })
})

// ── DELETE /api/family/slots/:slotId
router.delete('/slots/:slotId', requireAuth, requireFamily, async (req, res) => {
  const { data, error } = await supabase
    .from('family_slots')
    .delete()
    .eq('id', req.params.slotId)
    .eq('user_id', req.authUser.id)
    .select()

  if (error) return res.status(500).json({ error: error.message })
  if (!data || data.length === 0) return res.status(404).json({ error: 'Slot not found' })
  res.json({ success: true })
})

// ── PATCH /api/family/slots/:slotId/settings
router.patch('/slots/:slotId/settings', requireAuth, requireFamily, async (req, res) => {
  const { language, books_per_month } = req.body
  const updates = {}

  if (language !== undefined) {
    if (!VALID_LANGUAGES.includes(language)) {
      return res.status(400).json({ error: `language must be one of: ${VALID_LANGUAGES.join(', ')}` })
    }
    updates.language = language
  }
  if (books_per_month !== undefined) {
    updates.books_per_month = Math.min(50, Math.max(1, parseInt(books_per_month) || 1))
  }

  const { error } = await supabase
    .from('family_slots')
    .update(updates)
    .eq('id', req.params.slotId)
    .eq('user_id', req.authUser.id)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true })
})

// ── POST /api/family/slots/:slotId/connect
// Start a Playwright login for this family slot
// Body: { email, password }
router.post('/slots/:slotId/connect', requireAuth, requireFamily, async (req, res) => {
  const { slotId } = req.params
  const { email, password } = req.body
  const userId = req.authUser.id

  if (!email || !password) return res.status(400).json({ error: 'email and password required' })

  // Rate limit: max 5 connection attempts per user per hour
  if (!checkRateLimit(`slot-connect:${userId}`)) {
    return res.status(429).json({ error: 'Too many connection attempts. Please wait before trying again.' })
  }

  // Verify slot belongs to user
  const { data: slot } = await supabase
    .from('family_slots')
    .select('id')
    .eq('id', slotId)
    .eq('user_id', userId)
    .single()

  if (!slot) return res.status(404).json({ error: 'Slot not found' })

  const stateKey = `${userId}:${slotId}`

  // Use a composite key for session manager so it doesn't conflict with parent session
  const sessionKey = `${userId}__slot__${slotId}`

  slotConnectState[stateKey] = { status: 'connecting' }
  res.json({ status: 'connecting' })

  ;(async () => {
    try {
      const { ssToken, ssUser, ssProfile, cookies } = await sm.performLogin(
        sessionKey, email, password, (status) => {
          slotConnectState[stateKey] = { status }
        }
      )

      // Check uniqueness: this AINS account must not be linked elsewhere
      if (ssUser) {
        try {
          const parsed = JSON.parse(ssUser)
          const ainsId = parsed?.id || parsed?.userId || parsed?.username || null
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
              .neq('id', slotId)
              .maybeSingle()

            if (userConflict || slotConflict) {
              slotConnectState[stateKey] = {
                status: 'error',
                message: 'This AINS account is already linked to another Nilam Auto account or slot.'
              }
              return
            }

            await supabase.from('family_slots')
              .update({ ains_user_id_hash: hash })
              .eq('id', slotId)
              .eq('user_id', userId)
          }
        } catch {}
      }

      const sessionData = JSON.stringify({ ssToken, ssUser, ssProfile, cookies })
      await supabase.from('family_slots').update({
        ains_cookie_encrypted: encrypt(sessionData, slotId),
        ains_email_encrypted:  encrypt(email, slotId),
      }).eq('id', slotId).eq('user_id', userId)

      slotConnectState[stateKey] = { status: 'success' }
      scheduleSlotCleanup(stateKey)
      console.log(`[family] Slot ${slotId} connected successfully`)
    } catch (err) {
      console.error(`[family] Slot connect failed: ${err.message}`)
      slotConnectState[stateKey] = { status: 'error', message: err.message }
      scheduleSlotCleanup(stateKey)
    }
  })()
})

// ── GET /api/family/slots/:slotId/connect-status
router.get('/slots/:slotId/connect-status', requireAuth, requireFamily, async (req, res) => {
  const stateKey = `${req.authUser.id}:${req.params.slotId}`
  const state = slotConnectState[stateKey]

  if (state) {
    // Clear terminal states so they're only returned once
    if (state.status === 'success' || state.status === 'error') {
      delete slotConnectState[stateKey]
    }
    return res.json(state)
  }

  // Fallback: check DB cookie presence
  const { data } = await supabase
    .from('family_slots')
    .select('ains_cookie_encrypted')
    .eq('id', req.params.slotId)
    .eq('user_id', req.authUser.id)
    .single()

  res.json({ status: data?.ains_cookie_encrypted ? 'success' : 'idle' })
})

// ── POST /api/family/slots/:slotId/trigger
router.post('/slots/:slotId/trigger', requireAuth, requireActive, requireFamily, async (req, res) => {
  const { slotId } = req.params
  const userId = req.authUser.id

  // Rate limit: 5 slot triggers per user per hour
  const isAdmin = require('../lib/auth-middleware').isAdminEmail(req.authUser?.email)
  if (!isAdmin && !checkRateLimit(`slot-trigger:${userId}:${slotId}`, 5, 3600000)) {
    return res.status(429).json({ error: 'Too many slot triggers. Maximum 5 per hour.' })
  }

  const { data: slot } = await supabase
    .from('family_slots')
    .select('*')
    .eq('id', slotId)
    .eq('user_id', userId)
    .single()

  if (!slot) return res.status(404).json({ error: 'Slot not found' })
  if (!slot.ains_cookie_encrypted) {
    return res.status(400).json({ error: 'AINS not connected for this slot. Please connect first.' })
  }

  let responded = false
  const respond = (payload) => { if (!responded) { responded = true; res.json(payload) } }

  const timeout = setTimeout(() => {
    respond({ success: true, message: 'Submitting books in the background. Check History shortly.' })
  }, 170000)

  try {
    const result = await startBotForSlot(userId, slotId, slot)
    clearTimeout(timeout)
    if (result?.success === false && result?.reason === 'session_expired') {
      respond({ success: false, error: 'AINS session expired. Please reconnect this slot.' })
    } else if (result?.skipped) {
      let skipMsg
      switch (result?.reason) {
        case 'daily_limit':
          skipMsg = `Daily limit reached for this slot (max 30 books/day). Remaining credits carry over — try again tomorrow.`
          break
        case 'no_credits':
          skipMsg = `You're out of book credits. Top up credits on the Upgrade page to submit more.`
          break
        default:
          skipMsg = `Nothing to do — this slot has already submitted everything available right now.`
      }
      respond({ success: true, message: skipMsg })
    } else {
      const done  = result?.results?.filter(r => r.status === 'success').length ?? 0
      const total = result?.results?.length ?? '?'
      respond({ success: true, message: `Done! ${done}/${total} book(s) submitted.` })
    }
  } catch (err) {
    clearTimeout(timeout)
    respond({ success: false, error: err.message })
  }
})

module.exports = router
