/**
 * bot.js — Main bot orchestrator
 * Fetches user data, decrypts AINS credentials, picks books, runs fillForm.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })

const supabase = require('../lib/supabase')
const { decrypt } = require('../lib/crypto')
const { runBot } = require('./browser')
const { isAdminEmail } = require('../lib/auth-middleware')

// Plan limits — kept for labelling/feature reference only.
// Volume is now driven by CREDITS, not the plan tier (a user who buys credits
// must be able to spend them). noob = admin-granted tester role.
const PLAN_MAX = { free: 1, tester: 10, plus: 30, family: 50, noob: 999 }

// Anti-detection safety cap: no single AINS account may submit more than this
// many books in one calendar day (MYT). Leftover credits roll to the next day.
const DAILY_MAX = 30

// Per-user/slot lock: prevents simultaneous bot runs for the same user
const activeBotRuns = new Map()

// Global browser semaphore: caps total concurrent Playwright instances (~150-300 MB each)
const MAX_CONCURRENT_BROWSERS = parseInt(process.env.MAX_CONCURRENT_BROWSERS, 10) || 5
let activeBrowserCount = 0
const browserWaitQueue = []

async function acquireBrowserSlot(timeoutMs = 30000) {
  if (activeBrowserCount < MAX_CONCURRENT_BROWSERS) {
    activeBrowserCount++
    return () => { activeBrowserCount-- ; releaseBrowserSlot() }
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Browser pool full — try again later')), timeoutMs)
    browserWaitQueue.push((releaseFn) => {
      clearTimeout(timer)
      resolve(releaseFn)
    })
  })
}

function releaseBrowserSlot() {
  if (browserWaitQueue.length > 0 && activeBrowserCount < MAX_CONCURRENT_BROWSERS) {
    activeBrowserCount++
    const next = browserWaitQueue.shift()
    next(() => { activeBrowserCount-- ; releaseBrowserSlot() })
  }
}

async function withLock(key, fn, timeoutMs = 180000) {
  // Wait for any existing run on this key to finish
  while (activeBotRuns.has(key)) {
    try { await activeBotRuns.get(key) } catch { /* ignore errors from previous run */ }
  }
  let resolve
  const promise = new Promise(r => { resolve = r })
  activeBotRuns.set(key, promise)
  try {
    return await Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Bot run timed out')), timeoutMs))
    ])
  } finally {
    activeBotRuns.delete(key)
    resolve()
  }
}

// Returns Monday 00:00:00 MYT (UTC+8) of the current ISO week, expressed as UTC
// Railway servers run UTC — offset by +8h so the week resets at midnight MYT, not midnight UTC
function getWeekStart() {
  const MYT_OFFSET_MS = 8 * 60 * 60 * 1000
  const nowMYT = new Date(Date.now() + MYT_OFFSET_MS)
  const day = nowMYT.getUTCDay()    // day-of-week in MYT
  const mondayMYT = new Date(nowMYT)
  mondayMYT.setUTCDate(nowMYT.getUTCDate() - ((day + 6) % 7))
  mondayMYT.setUTCHours(0, 0, 0, 0)
  // Convert back to UTC for Supabase comparison
  return new Date(mondayMYT.getTime() - MYT_OFFSET_MS)
}

// Returns 00:00:00 MYT (UTC+8) of the current day, expressed as UTC.
// Used for the per-day submission safety cap.
function getDayStart() {
  const MYT_OFFSET_MS = 8 * 60 * 60 * 1000
  const nowMYT = new Date(Date.now() + MYT_OFFSET_MS)
  nowMYT.setUTCHours(0, 0, 0, 0)
  return new Date(nowMYT.getTime() - MYT_OFFSET_MS)
}

const { randomInt } = require('crypto')

// Fisher-Yates shuffle — unbiased, using cryptographically secure randomness
function fisherYates(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
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

  console.log(`[bot] Settings: ${userSettings.books_per_month} books/month, language=${userSettings.language}, plan=${activePlan}`)

  // 3. Decrypt and parse AINS session data
  let ssToken = null, ssUser = null, ssProfile = null, cookiesToInject = []
  try {
    const rawDecrypted = decrypt(user.ains_cookie_encrypted, userId)

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

  // 4. Check existing submissions (used to skip duplicate books, NOT to cap volume)
  // Free plan → 1 free book per WEEK (Monday 00:00 MYT); paid users spend credits.
  // Volume is governed by credits + the DAILY_MAX safety cap below.

  // Clean up stale pending records (older than 5 min) — prevents phantom quota blocks
  // from bot runs that crashed before they could mark submissions as failed/success
  // 5 min matches the expected max bot runtime (~3 min), leaving a small margin
  await supabase
    .from('submissions')
    .update({ status: 'failed', error_message: 'Timed out — previous run did not complete' })
    .eq('user_id', userId)
    .eq('status', 'pending')
    .lt('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())

  const now   = new Date()
  const month = now.getMonth() + 1
  const year  = now.getFullYear()
  const isFree = activePlan === 'free'

  let existingQuery = supabase
    .from('submissions')
    .select('book_id')
    .eq('user_id', userId)
    .is('family_slot_id', null)
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

  // ── Limits: CREDITS are the source of truth ───────────────
  // Free users get 1 credit-free book per week; everyone else spends 1 credit
  // per successful book. The plan tier no longer caps volume — buying credits
  // is what lets a user submit more.
  const creditBalance  = isAdminUser ? Infinity : (user.credits || 0)
  const freeRemaining  = isFree ? Math.max(0, 1 - alreadySubmitted.length) : 0
  const creditCeiling  = isAdminUser ? Infinity : (isFree ? freeRemaining + creditBalance : creditBalance)

  // Anti-detection daily cap: count today's submissions (success + pending) for
  // this user and allow at most DAILY_MAX per calendar day (MYT).
  let dailyRemaining = Infinity
  if (!isAdminUser) {
    const { data: todayRows } = await supabase
      .from('submissions')
      .select('id')
      .eq('user_id', userId)
      .is('family_slot_id', null)
      .in('status', ['success', 'pending'])
      .gte('created_at', getDayStart().toISOString())
    dailyRemaining = Math.max(0, DAILY_MAX - (todayRows?.length || 0))
  }

  const ceiling = Math.min(creditCeiling, dailyRemaining)

  // 5. Determine how many books to submit
  let needed
  if (overrideCount && overrideCount > 0) {
    needed = Math.min(overrideCount, ceiling)
  } else {
    needed = Math.min(userSettings.books_per_month || 4, ceiling)
  }
  console.log(`[bot] plan=${activePlan} credits=${creditBalance} freeSlot=${freeRemaining} dailyLeft=${dailyRemaining} → submitting ${needed}`)

  if (needed <= 0) {
    if (dailyRemaining <= 0) {
      console.log('[bot] Daily limit reached. Nothing to do.')
      return { success: true, skipped: true, reason: 'daily_limit' }
    }
    if (creditCeiling <= 0) {
      console.log('[bot] No credits remaining. Nothing to do.')
      return { success: true, skipped: true, reason: isFree ? 'free_weekly_used' : 'no_credits' }
    }
    console.log('[bot] Nothing to do.')
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

  // 8. Run the browser bot with injected session (global semaphore)
  let releaseBrowser
  let result
  try {
    releaseBrowser = await acquireBrowserSlot()
    result = await runBot({
      user,
      settings: userSettings,
      cookie: ssToken,
      ssUser,
      ssProfile,
      cookies: cookiesToInject,
      books: shuffled,
      submissions: insertedSubs,
    })
  } finally {
    if (releaseBrowser) releaseBrowser()
  }

  // 9. Deduct credits for successful submissions
  if (!isAdminUser) {
    try {
      const { data: finalSubs } = await supabase
        .from('submissions')
        .select('status')
        .in('id', insertedSubs.map(s => s.id))

      const successCount = finalSubs?.filter(s => s.status === 'success').length || 0
      if (successCount > 0) {
        // For free users: the first book(s) of the week are free — don't deduct those
        const freeUsedThisRun = isFree ? Math.min(freeRemaining, successCount) : 0
        const creditsToDeduct = successCount - freeUsedThisRun
        if (creditsToDeduct > 0) {
          await supabase.rpc('add_credits', { target_user_id: userId, amount: -creditsToDeduct })
          console.log(`[bot] Deducted ${creditsToDeduct} credit(s) (${successCount} succeeded, ${freeUsedThisRun} were free)`)
        }
      }
    } catch (err) {
      console.warn('[bot] Credit deduction failed:', err.message)
    }
  }

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

  // Credit check for family slots
  const isAdminUser = isAdminEmail(user.email)
  const creditBalance = isAdminUser ? Infinity : (user.credits || 0)

  // Decrypt slot session — supports both new JSON format and legacy plain-cookie
  let ssToken = null, ssUser = null, ssProfile = null, cookiesToInject = []
  try {
    const raw = decrypt(slot.ains_cookie_encrypted, slotId)
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

  // Clean up stale pending records (older than 5 min) — same logic as _startBot
  await supabase
    .from('submissions')
    .update({ status: 'failed', error_message: 'Timed out — previous run did not complete' })
    .eq('user_id', userId)
    .eq('family_slot_id', slotId)
    .eq('status', 'pending')
    .lt('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())

  const { data: existing } = await supabase
    .from('submissions')
    .select('book_id')
    .eq('user_id', userId)
    .eq('family_slot_id', slotId)
    .eq('month', month)
    .eq('year', year)
    .in('status', ['success'])

  const alreadyBookIds = (existing || []).map(s => s.book_id)

  // Credits (shared at the parent-user level) are the volume authority.
  const creditCeiling = isAdminUser ? Infinity : creditBalance

  // Daily safety cap per slot — each slot is its own AINS account.
  let dailyRemaining = Infinity
  if (!isAdminUser) {
    const { data: todayRows } = await supabase
      .from('submissions')
      .select('id')
      .eq('user_id', userId)
      .eq('family_slot_id', slotId)
      .in('status', ['success', 'pending'])
      .gte('created_at', getDayStart().toISOString())
    dailyRemaining = Math.max(0, DAILY_MAX - (todayRows?.length || 0))
  }

  const needed = Math.min(slot.books_per_month || 4, creditCeiling, dailyRemaining)
  if (needed <= 0) {
    if (dailyRemaining <= 0) return { success: true, skipped: true, reason: 'daily_limit' }
    if (creditCeiling <= 0) return { success: true, skipped: true, reason: 'no_credits' }
    return { success: true, skipped: true, reason: 'already_complete' }
  }

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

  // Run bot under global browser semaphore
  let releaseBrowser
  let result
  try {
    releaseBrowser = await acquireBrowserSlot()
    result = await runBot({
      user,
      settings: { language: slot.language || 'Melayu', books_per_month: slot.books_per_month || 4 },
      cookie: ssToken,
      ssUser,
      ssProfile,
      cookies: cookiesToInject,
      books: shuffled,
      submissions: insertedSubs,
    })
  } finally {
    if (releaseBrowser) releaseBrowser()
  }

  // Deduct credits for successful family slot submissions
  if (!isAdminUser) {
    try {
      const { data: finalSubs } = await supabase
        .from('submissions')
        .select('status')
        .in('id', insertedSubs.map(s => s.id))

      const successCount = finalSubs?.filter(s => s.status === 'success').length || 0
      if (successCount > 0) {
        await supabase.rpc('add_credits', { target_user_id: userId, amount: -successCount })
        console.log(`[bot] Deducted ${successCount} credit(s) for family slot ${slotId}`)
      }
    } catch (err) {
      console.warn('[bot] Credit deduction for family slot failed:', err.message)
    }
  }

  return result
}

module.exports = { startBot, startBotForSlot, PLAN_MAX }
