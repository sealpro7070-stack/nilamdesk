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
    .select('id, is_active, delima_id, cookie_updated_at, plan, plan_expires_at, ains_cookie_encrypted, credits')

  const publicMap = {}
  for (const u of (publicUsers || [])) publicMap[u.id] = u

  // 4. Fetch submission counts via aggregated RPC (prevents OOM with large datasets)
  const userIds = authUsers.map(u => u.id)
  let countMap = {}
  if (userIds.length > 0) {
    try {
      const { data: aggCounts } = await supabase.rpc('get_admin_submission_counts', { p_user_ids: userIds })
      for (const row of (aggCounts || [])) {
        countMap[row.user_id] = { total: parseInt(row.total || 0), success: parseInt(row.success || 0) }
      }
    } catch (rpcErr) {
      console.error('[admin] RPC aggregation failed, falling back to limited query:', rpcErr.message)
      const { data: subCounts } = await supabase
        .from('submissions')
        .select('user_id, status')
        .in('user_id', userIds)
        .limit(5000)
      for (const s of (subCounts || [])) {
        if (!countMap[s.user_id]) countMap[s.user_id] = { total: 0, success: 0 }
        countMap[s.user_id].total++
        if (s.status === 'success') countMap[s.user_id].success++
      }
    }
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
        credits:             pub.credits ?? 0,
        created_at:          u.created_at,
        last_sign_in:        u.last_sign_in_at,
        submissions_total:   countMap[u.id]?.total   || 0,
        submissions_success: countMap[u.id]?.success || 0,
      }
    })

  res.json({ users })
})

const VALID_ROLES = ['free', 'tester', 'plus', 'family', 'noob']

function isValidUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}

// POST /api/admin/set-role — assign a plan/role to any user
router.post('/set-role', requireAdmin, async (req, res) => {
  const { userId, role } = req.body

  if (!userId || !isValidUUID(userId)) return res.status(400).json({ error: 'userId must be a valid UUID' })
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` })
  }

  // grant_plan is atomic + idempotent: it sets plan/expiry/is_active and grants
  // 150 credits ONCE per active plan period. Clicking Approve repeatedly will not
  // double-credit, and plan + credits can never end up in a partial state.
  const { data, error } = await supabase.rpc('grant_plan', {
    target_user_id: userId,
    target_plan: role,
  })

  if (error) {
    console.error('[admin] set-role error:', error.message)
    return res.status(500).json({ error: 'Internal server error' })
  }

  const result = Array.isArray(data) ? data[0] : data
  res.json({
    success: true,
    user: { id: userId, plan: result?.plan, is_active: result?.is_active, credits: result?.credits },
  })
})

// POST /api/admin/activate — toggle is_active for a user
router.post('/activate', requireAdmin, async (req, res) => {
  const { userId, activate } = req.body

  if (!userId || !isValidUUID(userId) || typeof activate !== 'boolean') {
    return res.status(400).json({ error: 'userId (valid UUID) and activate (boolean) are required' })
  }

  const { data, error } = await supabase
    .from('users')
    .update({ is_active: activate })
    .eq('id', userId)
    .select('id, email, is_active')
    .single()

  if (error) {
    console.error('[admin] activate error:', error.message)
    return res.status(500).json({ error: 'Internal server error' })
  }

  res.json({ success: true, user: data })
})

// POST /api/admin/grant-credits — manually add/deduct credits for a user.
// Every grant is logged to admin_credit_grants (who/how-many/note/when) so the
// action is auditable. Uses add_credits RPC which floors the balance at 0.
router.post('/grant-credits', requireAdmin, async (req, res) => {
  const { userId, amount, note } = req.body

  if (!userId || !isValidUUID(userId)) {
    return res.status(400).json({ error: 'userId must be a valid UUID' })
  }
  const amt = Number(amount)
  if (!Number.isInteger(amt) || amt === 0 || Math.abs(amt) > 100000) {
    return res.status(400).json({ error: 'amount must be a non-zero integer (max ±100000)' })
  }
  if (note != null && (typeof note !== 'string' || note.length > 500)) {
    return res.status(400).json({ error: 'note must be a string up to 500 chars' })
  }

  // Apply the credit change (floors at 0, accepts negatives to deduct)
  const { error: rpcErr } = await supabase.rpc('add_credits', {
    target_user_id: userId,
    amount: amt,
  })
  if (rpcErr) {
    console.error('[admin] grant-credits add_credits error:', rpcErr.message)
    return res.status(500).json({ error: 'Internal server error' })
  }

  // Audit log (best-effort — credit change already applied)
  const { error: logErr } = await supabase.from('admin_credit_grants').insert({
    user_id: userId,
    amount: amt,
    note: note?.trim() || null,
    granted_by: req.adminUser.email,
  })
  if (logErr) console.error('[admin] grant-credits audit log error:', logErr.message)

  // Return the new balance
  const { data: userRow } = await supabase
    .from('users')
    .select('id, email, credits')
    .eq('id', userId)
    .single()

  res.json({ success: true, user: userRow })
})

// GET /api/admin/credit-grants?userId= — audit history of manual grants.
// Without userId, returns the 100 most recent grants across all users.
router.get('/credit-grants', requireAdmin, async (req, res) => {
  const { userId } = req.query

  let query = supabase
    .from('admin_credit_grants')
    .select('id, user_id, amount, note, granted_by, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  if (userId) {
    if (!isValidUUID(userId)) return res.status(400).json({ error: 'userId must be a valid UUID' })
    query = query.eq('user_id', userId)
  }

  const { data, error } = await query
  if (error) {
    console.error('[admin] credit-grants list error:', error.message)
    return res.status(500).json({ error: 'Internal server error' })
  }

  res.json({ grants: data || [] })
})

module.exports = router
