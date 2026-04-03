/**
 * bot.js — Main bot orchestrator
 * Fetches user data, decrypts AINS credentials, picks books, runs fillForm.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })

const supabase = require('../lib/supabase')
const { decrypt } = require('../lib/crypto')
const { runBot } = require('./browser')
const { isAdminEmail } = require('../lib/auth-middleware')

// Plan limits — single source of truth
// noob = tester role granted by admin, effectively unlimited
const PLAN_MAX = { free: 1, plus: 50, family: 50, noob: 999 }

// Per-user/slot lock: prevents simultaneous bot runs for the same user
const activeBotRuns = new Map()

async function withLock(key, fn) {
  // Wait for any existing run on this key to finish
  while (activeBotRuns.has(key)) {
    try { await activeBotRuns.get(key) } catch { /* ignore errors from previous run */ }
  }
  let resolve
  const promise = new Promise(r => { resolve = r })
  activeBotRuns.set(key, promise)
  try {
    return await fn()
  } finally {
    activeBotRuns.delete(key)
    resolve()
  }
}

// Returns Monday 00:00:00.000 of the current ISO week (Malaysia is UTC+8)
function getWeekStart() {
  const now = new Date()
  const day = now.getDay()           // 0 = Sunday, 1 = Monday … 6 = Saturday
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((day + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  return monday
}

// Fisher-Yates shuffle — unbiased, unlike sort(() => Math.random() - 0.5)
function fisherYates(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

async function startBot(userId, directCookie, directSsUser, directSsProfile, directCookies, overrideCount) {
  return withLock(userId, () => _startBot(userId, directCookie, directSsUser, directSsProfile, directCookies, overrideCount))
}

async function _startBot(userId, directCookie, directSsUser, directSsProfile, directCookies, overrideCount) {
  console.log(`\n[bot] Starting for userId: ${userId}${directCookie ? ' (direct cookie)' : ''}`)

  // 1. Fetch user
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()

  if (userErr || !user) throw new Error(`User not found: ${userId}`)
  if (!user.is_active) throw new Error('Account not activated')
  if (!user.ains_cookie_encrypted) throw new Error('No AINS session saved. Use "Connect AINS Account" on the dashboard to log in.')

  console.log(`[bot] User: ${user.email}`)

  // Derive plan limits from the user row (bot is the final authority — not the route layer)
  const isAdminUser = isAdminEmail(user.email)
  const planExpired = user.plan_expires_at && new Date(user.plan_expires_at) < new Date()
  // noob plan never expires (admin-granted tester role)
  const activePlan  = (user.plan === 'noob') ? 'noob' : (planExpired ? 'free' : (user.plan || 'free'))
  const maxAllowed  = isAdminUser ? 9999 : (PLAN_MAX[activePlan] ?? 1)

  // 2. Fetch settings
  const { data: settings } = await supabase
    .from('settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  const userSettings = settings || {
    books_per_month: 4,
    language: 'Melayu',
    book_type: 'Fizikal',
    auto_schedule: true,
    schedule_day: 15
  }

  console.log(`[bot] Settings: ${userSettings.books_per_month} books/month, language=${userSettings.language}, plan=${activePlan} (max=${maxAllowed})`)

  // 3. Decrypt and parse AINS session data
  let ssToken = null, ssUser = null, ssProfile = null, cookiesToInject = []
  try {
    const rawDecrypted = decrypt(user.ains_cookie_encrypted)
    console.log(`[bot] Raw decrypted preview: ${rawDecrypted.substring(0, 40)}...`)

    try {
      // New format: JSON with ssToken, ssUser, ssProfile, cookies
      const sessionData = JSON.parse(rawDecrypted)
      ssToken = sessionData.ssToken
      ssUser = sessionData.ssUser
      ssProfile = sessionData.ssProfile
      cookiesToInject = sessionData.cookies || []
      console.log(`[bot] Session JSON parsed: ssToken=${!!ssToken}, cookies=${cookiesToInject.length}`)
    } catch {
      // Legacy format: plain cookie string
      console.log('[bot] Legacy cookie string format detected')
      ssToken = rawDecrypted
      cookiesToInject = rawDecrypted.split(';').map(part => {
        const trimmed = part.trim()
        const idx = trimmed.indexOf('=')
        if (idx === -1) return null
        return { name: trimmed.substring(0, idx), value: trimmed.substring(idx + 1), domain: '.ains.moe.gov.my', path: '/' }
      }).filter(Boolean)
    }
  } catch (err) {
    throw new Error(`Failed to decrypt AINS session: ${err.message}`)
  }

  if (!ssToken) {
    console.warn('[bot] ssToken is null — attempting cookie-only session injection')
  }

  // 4. Check submissions for the current period
  // Free plan  → 1 book per WEEK  (Monday 00:00 – Sunday 23:59 MYT)
  // Plus/Family → up to 50 books per MONTH (per PLAN_MAX above)

  // Clean up stale pending records (older than 30 min) — prevents phantom quota blocks
  // from bot runs that crashed before they could mark submissions as failed/success
  await supabase
    .from('submissions')
    .update({ status: 'failed', error_message: 'Timed out — previous run did not complete' })
    .eq('user_id', userId)
    .eq('status', 'pending')
    .lt('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())

  const now   = new Date()
  const month = now.getMonth() + 1
  const year  = now.getFullYear()
  const isFree = activePlan === 'free'
  const periodLabel = isFree ? 'this week' : 'this month'

  let existingQuery = supabase
    .from('submissions')
    .select('book_id')
    .eq('user_id', userId)
    .in('status', ['success', 'pending'])

  if (isFree) {
    // Weekly window: Monday 00:00:00 to now
    existingQuery = existingQuery.gte('created_at', getWeekStart().toISOString())
  } else {
    existingQuery = existingQuery.eq('month', month).eq('year', year)
  }

  const { data: existing } = await existingQuery

  const alreadySubmitted = existing || []
  const alreadyBookIds   = alreadySubmitted.map(s => s.book_id)

  // 5. Determine how many books to submit — enforce plan limit in the bot itself
  let needed
  if (overrideCount && overrideCount > 0) {
    // overrideCount must not allow exceeding the remaining period allowance
    needed = Math.min(overrideCount, maxAllowed - alreadySubmitted.length)
    console.log(`[bot] Manual override: requested ${overrideCount}, allowed ${needed} (${alreadySubmitted.length}/${maxAllowed} already done ${periodLabel})`)
  } else {
    // Quota mode: free uses weekly max (1), paid uses books_per_month capped at plan max
    const periodTarget = isFree ? maxAllowed : Math.min(userSettings.books_per_month, maxAllowed)
    needed = periodTarget - alreadySubmitted.length
    if (needed <= 0) {
      console.log(`[bot] Already submitted ${alreadySubmitted.length}/${maxAllowed} books ${periodLabel}. Nothing to do.`)
      return { success: true, skipped: true, reason: 'already_complete' }
    }
    console.log(`[bot] Need ${needed} more book(s) to reach ${isFree ? 'weekly' : 'monthly'} quota (${alreadySubmitted.length}/${periodTarget} done)`)
  }

  if (needed <= 0) {
    console.log(`[bot] ${isFree ? 'Weekly' : 'Monthly'} quota already met. Nothing to do.`)
    return { success: true, skipped: true, reason: 'already_complete' }
  }

  // 6. Pick books: matching language, excluding already submitted this month
  let booksQuery = supabase
    .from('books')
    .select('*')
    .eq('language', userSettings.language)

  if (alreadyBookIds.length > 0) {
    booksQuery = booksQuery.not('id', 'in', `(${alreadyBookIds.join(',')})`)
  }

  const { data: availableBooks, error: booksErr } = await booksQuery.limit(200)

  if (booksErr) throw new Error(`Failed to fetch books: ${booksErr.message}`)
  if (!availableBooks || availableBooks.length === 0) {
    throw new Error(`No ${userSettings.language} books available. Please add more books to the seed data.`)
  }

  const shuffled = fisherYates(availableBooks).slice(0, needed)
  console.log(`[bot] Selected ${shuffled.length} book(s):`, shuffled.map(b => b.title))

  // 7. Create pending submission records
  const submissionRows = shuffled.map(book => ({
    user_id: userId,
    book_id: book.id,
    month,
    year,
    status: 'pending'
  }))

  const { data: insertedSubs, error: insertErr } = await supabase
    .from('submissions')
    .insert(submissionRows)
    .select()

  if (insertErr) throw new Error(`Failed to create submission records: ${insertErr.message}`)
  if (!insertedSubs) throw new Error('Failed to create submission records: no data returned')

  // Decrypt saved AINS credentials for fallback login
  let ainsEmail = null, ainsPassword = null
  try {
    if (user.ains_email_encrypted) ainsEmail = decrypt(user.ains_email_encrypted)
    if (user.ains_password_encrypted) ainsPassword = decrypt(user.ains_password_encrypted)
  } catch (err) {
    console.warn('[bot] Could not decrypt AINS credentials for fallback:', err.message)
  }

  // 8. Run the browser bot with injected session (+ fallback credentials)
  const result = await runBot({
    user,
    settings: userSettings,
    cookie: ssToken,
    ssUser,
    ssProfile,
    cookies: cookiesToInject,
    books: shuffled,
    submissions: insertedSubs,
    ainsEmail,
    ainsPassword,
  })

  return result
}

/**
 * startBotForSlot — Run the bot for a family plan slot
 */
async function startBotForSlot(userId, slotId, slot) {
  return withLock(`${userId}:${slotId}`, () => _startBotForSlot(userId, slotId, slot))
}

async function _startBotForSlot(userId, slotId, slot) {
  console.log(`\n[bot] Starting for family slot ${slotId}`)

  // Verify parent user is active and plan is still valid
  const { data: user } = await supabase.from('users').select('*').eq('id', userId).single()
  if (!user) throw new Error('Parent user not found for slot execution.')
  if (!user.is_active) throw new Error('Parent account is not active.')

  const planExpired = user.plan_expires_at && new Date(user.plan_expires_at) < new Date()
  if (user.plan !== 'family' || planExpired) throw new Error('Family plan required or has expired.')

  // Decrypt slot session — supports both new JSON format and legacy plain-cookie
  let ssToken = null, ssUser = null, ssProfile = null, cookiesToInject = []
  try {
    const raw = decrypt(slot.ains_cookie_encrypted)
    try {
      const sessionData = JSON.parse(raw)
      ssToken = sessionData.ssToken
      ssUser  = sessionData.ssUser
      ssProfile = sessionData.ssProfile
      cookiesToInject = sessionData.cookies || []
    } catch {
      // Legacy format
      console.log('[bot] Slot session: legacy cookie string format detected')
      ssToken = raw
      cookiesToInject = raw.split(';').map(part => {
        const trimmed = part.trim()
        const idx = trimmed.indexOf('=')
        if (idx === -1) return null
        return { name: trimmed.substring(0, idx), value: trimmed.substring(idx + 1), domain: '.ains.moe.gov.my', path: '/' }
      }).filter(Boolean)
    }
  } catch (err) {
    throw new Error(`Failed to decrypt slot session: ${err.message}`)
  }

  const now   = new Date()
  const month = now.getMonth() + 1
  const year  = now.getFullYear()

  // Include pending to prevent race condition duplicates
  const { data: existing } = await supabase
    .from('submissions')
    .select('book_id')
    .eq('user_id', userId)
    .eq('family_slot_id', slotId)
    .eq('month', month)
    .eq('year', year)
    .in('status', ['success', 'pending'])

  const alreadyBookIds = (existing || []).map(s => s.book_id)
  // Cap at plan limit (15), not a magic number
  const slotMax  = PLAN_MAX.family
  const needed   = Math.min(slot.books_per_month || 4, slotMax) - alreadyBookIds.length
  if (needed <= 0) return { success: true, skipped: true, reason: 'already_complete' }

  let booksQuery = supabase.from('books').select('*').eq('language', slot.language || 'Melayu')
  if (alreadyBookIds.length > 0) {
    booksQuery = booksQuery.not('id', 'in', `(${alreadyBookIds.join(',')})`)
  }

  const { data: availableBooks } = await booksQuery.limit(200)
  if (!availableBooks?.length) throw new Error('No books available for this slot.')

  const shuffled = fisherYates(availableBooks).slice(0, needed)

  const { data: insertedSubs, error: insertErr } = await supabase
    .from('submissions')
    .insert(shuffled.map(book => ({
      user_id: userId, book_id: book.id, month, year,
      status: 'pending', family_slot_id: slotId,
    })))
    .select()

  if (insertErr) throw new Error(`Failed to create slot submission records: ${insertErr.message}`)
  if (!insertedSubs) throw new Error('Failed to create slot submission records: no data returned')

  const result = await runBot({
    user,
    settings: { language: slot.language || 'Melayu', books_per_month: slot.books_per_month || 4 },
    cookie: ssToken,
    ssUser,
    ssProfile,
    cookies: cookiesToInject,
    books: shuffled,
    submissions: insertedSubs,
  })

  return result
}

module.exports = { startBot, startBotForSlot, PLAN_MAX }
