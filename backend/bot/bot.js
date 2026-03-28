/**
 * bot.js — Main bot orchestrator
 * Fetches user data, decrypts AINS credentials, picks books, runs fillForm.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })

const supabase = require('../lib/supabase')
const { decrypt } = require('../lib/crypto')
const { runBot } = require('./browser')

async function startBot(userId, directCookie, directSsUser, directSsProfile, directCookies, overrideCount) {
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

  // 2. Fetch settings
  const { data: settings } = await supabase
    .from('settings')
    .select('*')
    .eq('user_id', userId)
    .single()

  // Use defaults if no settings row yet
  const userSettings = settings || {
    books_per_month: 4,
    language: 'Melayu',
    book_type: 'Fizikal',
    auto_schedule: true,
    schedule_day: 15
  }

  console.log(`[bot] Settings: ${userSettings.books_per_month} books/month, language=${userSettings.language}`)

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
    // ssToken may be null if AINS hadn't set sessionStorage yet at capture time.
    // Proceed with cookies only — AINS may auto-refresh via its refresh-token cookie.
    console.warn('[bot] ssToken is null — attempting cookie-only session injection')
  }

  // 4. Check how many successful submissions already this month
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  const { data: existing } = await supabase
    .from('submissions')
    .select('book_id')
    .eq('user_id', userId)
    .eq('month', month)
    .eq('year', year)
    .eq('status', 'success')

  const alreadySubmitted = existing || []
  const alreadyBookIds = alreadySubmitted.map(s => s.book_id)

  // overrideCount = user explicitly chose "submit N books now" from the dashboard
  // Without override, use quota logic
  let needed
  if (overrideCount && overrideCount > 0) {
    needed = overrideCount
    console.log(`[bot] Manual override: submitting ${needed} book(s) now (${alreadySubmitted.length} already done this month)`)
  } else {
    needed = userSettings.books_per_month - alreadySubmitted.length
    if (needed <= 0) {
      console.log(`[bot] Already submitted ${alreadySubmitted.length}/${userSettings.books_per_month} books this month. Nothing to do.`)
      return { success: true, skipped: true, reason: 'already_complete' }
    }
    console.log(`[bot] Need ${needed} more book(s) to reach monthly quota`)
  }

  // 5. Pick books: matching language, not previously submitted this month
  let booksQuery = supabase
    .from('books')
    .select('*')
    .eq('language', userSettings.language)

  if (alreadyBookIds.length > 0) {
    booksQuery = booksQuery.not('id', 'in', `(${alreadyBookIds.join(',')})`)
  }

  const { data: availableBooks, error: booksErr } = await booksQuery.limit(100)

  if (booksErr) throw new Error(`Failed to fetch books: ${booksErr.message}`)
  if (!availableBooks || availableBooks.length === 0) {
    throw new Error(`No ${userSettings.language} books available. Please add more books to the seed data.`)
  }

  // Shuffle and pick needed count
  const shuffled = availableBooks.sort(() => 0.5 - Math.random()).slice(0, needed)
  console.log(`[bot] Selected ${shuffled.length} book(s):`, shuffled.map(b => b.title))

  // 6. Create pending submission records
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

  // 7. Run the browser bot with injected session
  const result = await runBot({
    user,
    settings: userSettings,
    cookie: ssToken,
    ssUser,
    ssProfile,
    cookies: cookiesToInject,
    books: shuffled,
    submissions: insertedSubs
  })

  return result
}

/**
 * startBotForSlot — Run the bot for a family plan slot
 */
async function startBotForSlot(userId, slotId, slot) {
  console.log(`\n[bot] Starting for family slot ${slotId}`)

  let ssToken = null, ssUser = null, ssProfile = null, cookiesToInject = []
  try {
    const raw = decrypt(slot.ains_cookie_encrypted)
    const sessionData = JSON.parse(raw)
    ssToken = sessionData.ssToken
    ssUser  = sessionData.ssUser
    ssProfile = sessionData.ssProfile
    cookiesToInject = sessionData.cookies || []
  } catch (err) {
    throw new Error(`Failed to decrypt slot session: ${err.message}`)
  }

  const now   = new Date()
  const month = now.getMonth() + 1
  const year  = now.getFullYear()

  const { data: existing } = await supabase
    .from('submissions')
    .select('book_id')
    .eq('user_id', userId)
    .eq('family_slot_id', slotId)
    .eq('month', month)
    .eq('year', year)
    .eq('status', 'success')

  const alreadyBookIds = (existing || []).map(s => s.book_id)
  const needed = Math.min(slot.books_per_month || 4, 15) - alreadyBookIds.length
  if (needed <= 0) return { success: true, skipped: true, reason: 'already_complete' }

  let booksQuery = supabase.from('books').select('*').eq('language', slot.language || 'Melayu')
  if (alreadyBookIds.length > 0) {
    booksQuery = booksQuery.not('id', 'in', `(${alreadyBookIds.join(',')})`)
  }

  const { data: availableBooks } = await booksQuery.limit(100)
  if (!availableBooks?.length) throw new Error('No books available for this slot.')

  const shuffled = availableBooks.sort(() => 0.5 - Math.random()).slice(0, needed)

  const { data: insertedSubs } = await supabase
    .from('submissions')
    .insert(shuffled.map(book => ({
      user_id: userId, book_id: book.id, month, year,
      status: 'pending', family_slot_id: slotId,
    })))
    .select()

  // Fetch parent user for runBot
  const { data: user } = await supabase.from('users').select('*').eq('id', userId).single()

  const result = await runBot({
    user,
    settings: { language: slot.language, books_per_month: slot.books_per_month },
    cookie: ssToken,
    ssUser,
    ssProfile,
    cookies: cookiesToInject,
    books: shuffled,
    submissions: insertedSubs || [],
  })

  return result
}

module.exports = { startBot, startBotForSlot }
