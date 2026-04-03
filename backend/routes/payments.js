/**
 * payments.js — Payment request routes
 *
 * Flow:
 *  1. User selects plan → POST /api/payments/request (creates pending request)
 *  2. User pays via TNG QR and submits reference
 *  3. Admin sees it in Admin panel → POST /api/payments/admin/review (approve/reject)
 *  4. On approve: user.plan updated, plan_expires_at set to +1 year
 *
 * Future: swap manual flow for Lemon Squeezy webhook at POST /api/payments/webhook
 */

const express   = require('express')
const router    = express.Router()
const supabase  = require('../lib/supabase')
const { requireAuth } = require('../lib/auth-middleware')

const PLAN_PRICES = { plus: 18, family: 48 }
const PLAN_LABELS = { plus: 'Plus', family: 'Family' }

// ─── Admin guard ──────────────────────────────────────────────────────────────
const { isAdminEmail } = require('../lib/auth-middleware')
function requireAdmin(req, res, next) {
  if (!isAdminEmail(req.authUser?.email)) {
    return res.status(403).json({ error: 'Admin only' })
  }
  next()
}

// ── GET /api/payments/my-plan
// Returns the current user's plan info
router.get('/my-plan', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('plan, plan_expires_at, is_active')
    .eq('id', req.authUser.id)
    .single()

  if (error) return res.status(500).json({ error: error.message })
  const planExpired = data.plan_expires_at && new Date(data.plan_expires_at) < new Date()
  res.json({
    plan: data.plan || 'free',
    plan_expires_at: data.plan_expires_at || null,
    is_active: data.is_active && data.plan !== 'free' && !planExpired,
  })
})

// ── GET /api/payments/my-request
// Returns the user's latest payment request (so UI can show pending state)
router.get('/my-request', requireAuth, async (req, res) => {
  const { data } = await supabase
    .from('payment_requests')
    .select('*')
    .eq('user_id', req.authUser.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  res.json({ request: data || null })
})

// ── POST /api/payments/request
// Body: { plan: 'plus'|'family', reference: '...' }
router.post('/request', requireAuth, async (req, res) => {
  const userId = req.authUser.id
  const { plan, reference, receipt_data } = req.body

  if (!PLAN_PRICES[plan]) {
    return res.status(400).json({ error: 'Invalid plan. Must be "plus" or "family".' })
  }

  // Validate reference length — prevents DoS via oversized strings
  if (reference && reference.trim().length > 100) {
    return res.status(400).json({ error: 'Reference must be 100 characters or fewer.' })
  }

  // Validate receipt MIME type — prevents XSS via SVG/script injection in admin lightbox
  if (receipt_data) {
    const ALLOWED_MIME_PREFIXES = ['data:image/jpeg;', 'data:image/png;', 'data:image/webp;', 'data:image/gif;']
    const isValidImage = ALLOWED_MIME_PREFIXES.some(p => receipt_data.startsWith(p))
    if (!isValidImage) {
      return res.status(400).json({ error: 'Receipt must be a JPEG, PNG, WebP, or GIF image.' })
    }
    // Backend size guard: ~6MB base64 ≈ 4.5MB file
    if (receipt_data.length > 6_000_000) {
      return res.status(400).json({ error: 'Receipt image must be under 5MB.' })
    }
  }

  // Block if already has a pending request
  const { data: existing } = await supabase
    .from('payment_requests')
    .select('id, status, created_at')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) {
    return res.status(409).json({
      error: 'You already have a pending payment request. Please wait for admin approval.',
      existing,
    })
  }

  // Check if user already on this plan and not expired
  const { data: user } = await supabase
    .from('users')
    .select('plan, plan_expires_at')
    .eq('id', userId)
    .single()

  if (user?.plan === plan && user?.plan_expires_at && new Date(user.plan_expires_at) > new Date()) {
    return res.status(409).json({ error: `You are already on the ${PLAN_LABELS[plan]} plan.` })
  }

  const { data, error } = await supabase
    .from('payment_requests')
    .insert({
      user_id:   userId,
      plan,
      amount:    PLAN_PRICES[plan],
      reference: reference ? reference.trim() : null,
      receipt_data: receipt_data || null
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true, request: data })
})

// ── GET /api/payments/admin/list
// Admin: list all payment requests (newest first)
router.get('/admin/list', requireAuth, requireAdmin, async (req, res) => {
  const { status } = req.query // optional filter: pending | approved | rejected

  let q = supabase
    .from('payment_requests')
    .select(`
      *,
      users!payment_requests_user_id_fkey (email, plan, plan_expires_at)
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  if (status) q = q.eq('status', status)

  const { data, error } = await q
  if (error) return res.status(500).json({ error: error.message })
  res.json({ requests: data })
})

// ── POST /api/payments/admin/review
// Body: { requestId, action: 'approve'|'reject' }
router.post('/admin/review', requireAuth, requireAdmin, async (req, res) => {
  const { requestId, action } = req.body
  if (!requestId || !['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'requestId and action (approve|reject) required' })
  }

  // Fetch the request (verify it exists)
  const { data: pr, error: prErr } = await supabase
    .from('payment_requests')
    .select('*')
    .eq('id', requestId)
    .single()

  if (prErr || !pr) return res.status(404).json({ error: 'Payment request not found' })

  // Atomic update: only succeeds if status is still 'pending' — prevents double-approval
  const { data: updated, error: updateErr } = await supabase
    .from('payment_requests')
    .update({
      status:      action === 'approve' ? 'approved' : 'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: req.authUser.email,
    })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select()

  if (updateErr) return res.status(500).json({ error: updateErr.message })
  if (!updated?.length) return res.status(409).json({ error: `Request has already been processed` })

  // If approved: update user's plan
  if (action === 'approve') {
    const expiresAt = new Date()
    expiresAt.setFullYear(expiresAt.getFullYear() + 1)

    const { error: planErr } = await supabase
      .from('users')
      .update({
        plan:            pr.plan,
        plan_expires_at: expiresAt.toISOString(),
        is_active:       true,
      })
      .eq('id', pr.user_id)

    if (planErr) {
      // Revert the payment request back to pending — also clear audit fields
      // so admin doesn't see stale reviewed_by on a re-pending request
      await supabase.from('payment_requests')
        .update({ status: 'pending', reviewed_at: null, reviewed_by: null })
        .eq('id', requestId)
      return res.status(500).json({ error: 'Payment approved but plan update failed. Please retry.' })
    }
  }

  res.json({ success: true, action })
})

// ── GET /api/payments/qr-settings
// Public: returns the current TNG QR image data (fetched by UpgradeModal)
router.get('/qr-settings', async (req, res) => {
  const { data } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'tng_qr')
    .maybeSingle()
  res.json({ qr_data: data?.value || null })
})

// ── POST /api/payments/admin/qr-settings
// Admin: upload/replace the TNG QR image (stored as base64 data URL)
router.post('/admin/qr-settings', requireAuth, requireAdmin, async (req, res) => {
  const { qr_data } = req.body
  if (!qr_data) return res.status(400).json({ error: 'qr_data required' })

  const { error } = await supabase
    .from('admin_settings')
    .upsert({ key: 'tng_qr', value: qr_data, updated_at: new Date().toISOString() }, { onConflict: 'key' })

  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true })
})

// ── POST /api/payments/webhook
// Placeholder for future Lemon Squeezy webhook integration
// Set LEMONSQUEEZY_WEBHOOK_SECRET in Railway env when ready
// NOTE: returns 501 until signature verification is implemented — prevents unauthorized plan grants
router.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  res.status(501).json({ error: 'Webhook not yet configured. Set LEMONSQUEEZY_WEBHOOK_SECRET to enable.' })
})

module.exports = router
