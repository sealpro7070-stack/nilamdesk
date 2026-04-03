const express = require('express')
const router = express.Router()
const supabase = require('../lib/supabase')
const { isAdminEmail, ADMIN_EMAILS } = require('../lib/auth-middleware')

// ── Admin auth middleware ─────────────────────────────────────────
// Decodes the JWT payload directly (no extra client needed),
// then uses the service role to look up the real user by ID.
async function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.replace('Bearer ', '').trim()

  if (!token) return res.status(401).json({ error: 'No token provided' })

  try {
    // Verify the JWT signature via Supabase — same pattern as requireAuth
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return res.status(401).json({ error: 'Invalid token' })
    if (!isAdminEmail(user.email)) return res.status(403).json({ error: 'Access denied' })

    req.adminUser = user
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

// GET /api/admin/users — list all users with stats
router.get('/users', requireAdmin, async (req, res) => {
  // 1. Get ALL users from Supabase Auth (service role can do this)
  const { data: authData, error: authError } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (authError) return res.status(500).json({ error: authError.message })

  const authUsers = authData.users || []

  // 2. Auto-create any missing public.users rows
  if (authUsers.length > 0) {
    const rows = authUsers.map(u => ({
      id: u.id,
      email: u.email,
      // Admin is always active
      is_active: isAdminEmail(u.email) ? true : false,
      created_at: u.created_at
    }))
    const { error: upsertErr } = await supabase.from('users').upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
    if (upsertErr) console.error('[admin] upsert error:', upsertErr.message)

    // Ensure admin is always active even if row already existed
    if (ADMIN_EMAILS.length > 0) {
      await supabase.from('users').update({ is_active: true }).in('email', ADMIN_EMAILS)
    }
  }

  // 3. Fetch public.users for activation + cookie status + plan/role
  const { data: publicUsers } = await supabase
    .from('users')
    .select('id, is_active, delima_id, cookie_updated_at, plan, plan_expires_at, ains_cookie_encrypted')

  const publicMap = {}
  for (const u of (publicUsers || [])) publicMap[u.id] = u

  // 4. Fetch submission counts
  const userIds = authUsers.map(u => u.id)
  const { data: subCounts } = userIds.length
    ? await supabase.from('submissions').select('user_id, status').in('user_id', userIds)
    : { data: [] }

  const countMap = {}
  for (const s of (subCounts || [])) {
    if (!countMap[s.user_id]) countMap[s.user_id] = { total: 0, success: 0 }
    countMap[s.user_id].total++
    if (s.status === 'success') countMap[s.user_id].success++
  }

  // 5. Merge everything
  const users = authUsers
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map(u => {
      const pub = publicMap[u.id] || {}
      const planExpired = pub.plan_expires_at && new Date(pub.plan_expires_at) < new Date()
      const effectivePlan = (pub.plan === 'noob') ? 'noob' : (planExpired ? 'free' : (pub.plan || 'free'))
      return {
        id: u.id,
        email: u.email,
        delima_id:           pub.delima_id || null,
        is_active:           pub.is_active || false,
        has_cookie:          !!(pub.cookie_updated_at || pub.ains_cookie_encrypted),
        cookie_updated_at:   pub.cookie_updated_at || null,
        plan:                effectivePlan,
        plan_raw:            pub.plan || 'free',
        plan_expires_at:     pub.plan_expires_at || null,
        created_at:          u.created_at,
        last_sign_in:        u.last_sign_in_at,
        submissions_total:   countMap[u.id]?.total   || 0,
        submissions_success: countMap[u.id]?.success || 0,
      }
    })

  res.json({ users })
})

const VALID_ROLES = ['free', 'plus', 'family', 'noob']

// POST /api/admin/set-role — assign a plan/role to any user
router.post('/set-role', requireAdmin, async (req, res) => {
  const { userId, role } = req.body

  if (!userId) return res.status(400).json({ error: 'userId is required' })
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` })
  }

  // noob role: no expiry, stays until admin changes it
  // paid plans: set expiry 1 year from now when granted manually
  const updates = { plan: role }
  if (role === 'plus' || role === 'family') {
    const expires = new Date()
    expires.setFullYear(expires.getFullYear() + 1)
    updates.plan_expires_at = expires.toISOString()
    updates.is_active = true
  } else if (role === 'noob') {
    updates.plan_expires_at = null  // noob never expires
    updates.is_active = true
  } else if (role === 'free') {
    updates.plan_expires_at = null
    // don't change is_active on downgrade — admin controls that separately
  }

  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId)
    .select('id, email, plan, is_active')
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true, user: data })
})

// POST /api/admin/activate — toggle is_active for a user
router.post('/activate', requireAdmin, async (req, res) => {
  const { userId, activate } = req.body

  if (!userId || typeof activate !== 'boolean') {
    return res.status(400).json({ error: 'userId and activate (boolean) are required' })
  }

  const { data, error } = await supabase
    .from('users')
    .update({ is_active: activate })
    .eq('id', userId)
    .select('id, email, is_active')
    .single()

  if (error) return res.status(500).json({ error: error.message })

  res.json({ success: true, user: data })
})

module.exports = router
