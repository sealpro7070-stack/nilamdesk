const express = require('express')
const router = express.Router()
const supabase = require('../lib/supabase')
const { startBot } = require('../bot/bot')
const { requireAuth, checkRateLimit, isAdminEmail } = require('../lib/auth-middleware')

// POST /api/trigger
// Body: { userId } OR { userIdentifier: email }
router.post('/', requireAuth, async (req, res) => {
  console.log('[trigger] Received request:', JSON.stringify(req.body).substring(0, 100))
  let { userId, count } = req.body

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' })
  }

  const isAdmin = isAdminEmail(req.authUser?.email)

  // Only admin can trigger for other users
  if (userId !== req.authUser.id && !isAdmin) {
    return res.status(403).json({ error: 'Access denied' })
  }

  // Quick pre-checks before launching browser
  // Use maybeSingle() so a missing row returns null (not an error)
  let { data: user, error: userQueryErr } = await supabase
    .from('users')
    .select('is_active, ains_cookie_encrypted, email, plan, plan_expires_at')
    .eq('id', userId)
    .maybeSingle()

  // Fallback: if the full select fails (e.g. migration-v2 columns not yet added),
  // try a minimal select so we can still proceed with basic checks
  if (userQueryErr) {
    console.error('[trigger] DB user query error (full select):', userQueryErr.message)
    const { data: basicUser } = await supabase
      .from('users')
      .select('is_active, email')
      .eq('id', userId)
      .maybeSingle()
    if (basicUser) {
      user = { ...basicUser, ains_cookie_encrypted: null, plan: null, plan_expires_at: null }
      console.warn('[trigger] Using basic user data — run migration-v2.sql in Supabase to unlock full features')
    }
  }

  // Auto-create the user row if missing (handles Google OAuth users who bypassed registration)
  // Use req.authUser (already JWT-verified) — no admin SDK call needed
  if (!user) {
    console.log(`[trigger] No public.users row for ${userId}, auto-creating...`)
    await supabase.from('users').upsert({
      id:        userId,
      email:     req.authUser.email,
      is_active: isAdmin,
    }, { onConflict: 'id' })

    // Re-fetch after upsert — use maybeSingle() again
    const { data: refetched, error: refetchErr } = await supabase
      .from('users')
      .select('is_active, ains_cookie_encrypted, email, plan, plan_expires_at')
      .eq('id', userId)
      .maybeSingle()

    if (refetchErr) console.error('[trigger] Re-fetch error:', refetchErr.message)
    user = refetched
  }

  if (!user) return res.status(500).json({ error: 'Could not load your account. Please try again or contact support.' })
  if (!user.is_active && !isAdmin) return res.status(403).json({ error: 'Account not activated. Please subscribe.' })
  if (!user.ains_cookie_encrypted) return res.status(400).json({ error: 'No AINS session saved. Use "Connect AINS Account" on the dashboard.' })

  // Plan limit enforcement
  // noob = admin-granted tester role, never expires, unlimited books
  const planExpired = user.plan_expires_at && new Date(user.plan_expires_at) < new Date()
  const activePlan  = (user.plan === 'noob') ? 'noob' : (planExpired ? 'free' : (user.plan || 'free'))
  const PLAN_MAX    = { free: 1, plus: 50, family: 50, noob: 999 }
  const maxAllowed  = isAdmin ? 9999 : (PLAN_MAX[activePlan] ?? 1)

  // Rate limit: 5 runs per user per hour (skip for admin and noob testers)
  const skipRateLimit = isAdmin || activePlan === 'noob'
  if (!skipRateLimit && !checkRateLimit(userId)) {
    return res.status(429).json({ error: 'Too many requests. Maximum 5 submissions per hour.' })
  }

  const countNum = count ? Math.min(parseInt(count), maxAllowed) : null

  // Wait up to 3 minutes for bot to complete. If it takes longer, respond mid-flight.
  let responded = false
  const respond = (payload) => {
    if (!responded) { responded = true; res.json(payload) }
  }

  // Timeout after 170s — Railway's limit is ~180s
  const timeout = setTimeout(() => {
    respond({ success: true, message: `Submitting ${countNum ?? 'scheduled'} book(s) in the background. Check History in a few minutes.` })
  }, 170000)

  try {
    const result = await startBot(userId, null, null, null, null, countNum)
    clearTimeout(timeout)
    if (result?.success === false && result?.reason === 'session_expired') {
      respond({ success: false, error: 'AINS session expired. Please reconnect using "Connect AINS Account" on the dashboard.' })
    } else if (result?.skipped) {
      const skipMsg = activePlan === 'free'
        ? `Already submitted your 1 book this week. Your quota resets every Monday!`
        : `Already submitted this month's quota. Nothing to do!`
      respond({ success: true, message: skipMsg })
    } else {
      const done = result?.results?.filter(r => r.status === 'success').length ?? 0
      const total = result?.results?.length ?? countNum ?? '?'
      respond({ success: true, message: `Done! ${done}/${total} book(s) submitted. Check History for details.` })
    }
  } catch (err) {
    clearTimeout(timeout)
    console.error('[trigger] Bot error:', err.message)
    respond({ success: false, error: err.message })
  }
})

module.exports = router
