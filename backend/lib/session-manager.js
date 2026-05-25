/**
 * session-manager.js — Manages Playwright browser sessions for silent AINS login
 * Launches a headless browser, performs the full Microsoft login flow server-side,
 * waits for MFA approval, then captures and returns the AINS session tokens + cookies.
 */

const { chromium } = require('playwright')

const sessions = {} // { userId: { browser, context, page } }

const AINS_URL = 'https://ains.moe.gov.my'
const MFA_TIMEOUT_MS = 3 * 60 * 1000 // 3 minutes for user to approve MFA

/**
 * Launch a headless Chromium browser with anti-bot masking
 */
async function createSession(userId) {
  console.log(`[session] Creating session for user ${userId}`)

  if (sessions[userId]) {
    await destroySession(userId).catch(() => {})
  }

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-ipc-flooding-protection',
    ],
  })

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'ms-MY',
    timezoneId: 'Asia/Kuala_Lumpur',
    extraHTTPHeaders: { 'Accept-Language': 'ms-MY,ms;q=0.9,en-US;q=0.8,en;q=0.7' },
  })

  const page = await context.newPage()

  // Thorough automation masking — prevents Microsoft bot detection
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] })
    Object.defineProperty(navigator, 'languages', { get: () => ['ms-MY', 'ms', 'en-US', 'en'] })
    Object.defineProperty(navigator, 'platform', { get: () => 'Win32' })
    window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {}, app: {} }
    const originalQuery = window.navigator.permissions.query
    window.navigator.permissions.query = (params) =>
      params.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : originalQuery(params)
  })

  // Intercept sessionStorage.setItem so we capture jb-app-* values the instant Vue writes them.
  // Polling waitForFunction can miss a write that happens before polling fires; this doesn't.
  await context.addInitScript(() => {
    const orig = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, val) {
      orig.call(this, key, val)
      if (key === 'jb-app-token' || key === 'jb-app-user' || key === 'jb-app-profile') {
        window.__nilamCapture = window.__nilamCapture || {}
        window.__nilamCapture[key] = val
      }
    }
  })

  sessions[userId] = { browser, context, page }
  return sessions[userId]
}

/**
 * Get an existing session
 */
function getSession(userId) {
  return sessions[userId] || null
}

/**
 * Destroy a session and close the browser
 */
async function destroySession(userId) {
  const session = sessions[userId]
  if (!session) return

  try {
    await session.browser.close().catch(() => {})
  } catch {}

  delete sessions[userId]
  console.log(`[session] Destroyed session for ${userId}`)
}

/**
 * Get all cookies from the context
 */
async function getCookies(userId) {
  const session = getSession(userId)
  if (!session) throw new Error('Session not found')
  return session.context.cookies()
}

/**
 * Perform the full silent Microsoft login flow for AINS.
 * Types credentials server-side, waits for MFA approval, returns session data.
 *
 * @param {string} userId
 * @param {string} email
 * @param {string} password
 * @param {function} onStatus - called with 'waiting_mfa' once password is submitted
 * @returns {{ ssToken, ssUser, ssProfile, cookies }}
 */
async function performLogin(userId, email, password, onStatus) {
  await createSession(userId)
  const { page } = sessions[userId]

  try {
    console.log(`[login] Navigating to AINS for user ${userId}`)
    await page.goto(AINS_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })

    // Navigate to the AINS login page directly, then click the DELIMa/Microsoft button
    const onMicrosoft = () => /login\.microsoftonline\.com|login\.microsoft\.com/.test(page.url())

    if (!onMicrosoft()) {
      // Go straight to /login — skip any landing page
      if (!page.url().includes('/login')) {
        console.log(`[login] Navigating directly to /login`)
        await page.goto(`${AINS_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 })
      }

      console.log(`[login] On login page (${page.url()}), clicking DELIMa button`)

      // Wait for the Vue app to render the login button instead of a fixed sleep
      await page.waitForSelector('a, button', { timeout: 8000 }).catch(() => {})

      // Click whichever button/link triggers the Microsoft OAuth redirect
      const clicked = await page.evaluate(() => {
        const all = [...document.querySelectorAll('a, button, [role="button"]')]
        const target = all.find(el => {
          const t = (el.textContent || '').toLowerCase().trim()
          const h = (el.getAttribute('href') || '').toLowerCase()
          const cls = (el.className || '').toLowerCase()
          return t.includes('delima') || t.includes('microsoft') ||
                 t.includes('log masuk') || t.includes('sign in') ||
                 h.includes('microsoft') || h.includes('oauth') ||
                 cls.includes('microsoft') || cls.includes('delima')
        })
        if (target) { target.click(); return target.textContent?.trim() }
        return null
      })

      console.log(`[login] Clicked: ${clicked || 'nothing found — waiting anyway'}`)

      // Wait up to 30s for Microsoft OR Google redirect
      await page.waitForURL(
        /login\.microsoftonline\.com|login\.microsoft\.com|accounts\.google\.com/,
        { timeout: 30000 }
      )
    }

    const currentUrl = page.url()
    console.log(`[login] On auth provider page: ${currentUrl}`)
    const isGoogle = currentUrl.includes('accounts.google.com')

    if (isGoogle) {
      // Google login flow
      await page.waitForSelector('input[type="email"], #identifierId', { timeout: 10000 })
      await page.locator('input[type="email"], #identifierId').first().fill(email)
      // Click Next (Google uses a button inside #identifierNext)
      await page.locator('#identifierNext, button[jsname="LgbsSe"]').first().click().catch(async () => {
        await page.keyboard.press('Enter')
      })

      // Google has a permanently-hidden password input (name="hiddenPassword", aria-hidden="true")
      // alongside the real visible one. We must target ONLY the visible field.
      await page.waitForTimeout(1000) // Google animates the password field in after clicking Next
      const pwLocator = page.locator('input[type="password"]').filter({ visible: true })
      await pwLocator.waitFor({ state: 'visible', timeout: 10000 })
      await pwLocator.fill(password)
      await page.locator('#passwordNext, button[jsname="LgbsSe"]').first().click().catch(async () => {
        await page.keyboard.press('Enter')
      })
    } else {
      // Microsoft login flow
      await page.waitForSelector('input[type="email"], #i0116', { timeout: 10000 })
      await page.locator('input[type="email"], #i0116').first().fill(email)
      await page.locator('input[type="submit"], #idSIButton9').first().click()

      await page.waitForSelector('#i0118, input[type="password"]', { timeout: 10000 })
      await page.locator('#i0118, input[type="password"]').first().fill(password)
      await page.locator('input[type="submit"], #idSIButton9').first().click()
    }

    console.log(`[login] Credentials submitted (${isGoogle ? 'Google' : 'Microsoft'}), waiting for MFA/redirect`)

    // Wait 3s for the MFA challenge page to render, then detect number-matching
    await page.waitForTimeout(3000)

    const extractNumber = () => page.evaluate(() => {
      const candidates = []
      for (const el of document.querySelectorAll('*')) {
        if (el.children.length > 0) continue
        const txt = (el.textContent || '').trim()
        if (!/^\d{2}$/.test(txt)) continue
        const rect = el.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) continue
        const fs = parseFloat(window.getComputedStyle(el).fontSize) || 0
        candidates.push({ txt, fs, area: rect.width * rect.height })
      }
      if (candidates.length === 0) return null
      candidates.sort((a, b) => b.fs - a.fs || b.area - a.area)
      return candidates[0].txt
    }).catch(() => null)

    let mfaNumber = await extractNumber()
    // Retry once after 2s if number-matching challenge hasn't rendered yet
    if (!mfaNumber) {
      await page.waitForTimeout(2000)
      mfaNumber = await extractNumber()
    }

    console.log(`[login] MFA challenge: ${mfaNumber ? `number-matching (${mfaNumber})` : 'simple push approval'}`)
    if (onStatus) onStatus('waiting_mfa', { mfaNumber })

    // Wait for final redirect to ains.moe.gov.my — this is the definitive signal that
    // authentication (including MFA) is complete. Using the AINS URL directly avoids the
    // race where intermediate OAuth redirects briefly leave the auth provider domain,
    // causing the old "leave auth provider" check to resolve prematurely.
    await page.waitForURL(
      url => url.href.startsWith('https://ains.moe.gov.my'),
      { timeout: MFA_TIMEOUT_MS }
    )
    console.log(`[login] Authenticated, landed on AINS: ${page.url()}`)

    // MFA approved — update status so the frontend stops showing "Check your phone"
    // and shows a "capturing session" spinner instead.
    if (onStatus) onStatus('capturing')

    // Hard 3-minute deadline for the entire post-MFA capture phase.
    // Without this, any hung Playwright call (network, page crash, slow AINS server)
    // leaves the user waiting on the "Capturing…" screen indefinitely.
    const CAPTURE_TIMEOUT_MS = 3 * 60 * 1000
    const captureDeadline = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Session capture timed out after 3 minutes')), CAPTURE_TIMEOUT_MS)
    )

    const captureSession = async () => {
      // After Google OAuth the browser passes through api.moe.gov.my/callback (or
      // ains-api.moe.gov.my/auth/callback) before landing on the real AINS frontend.
      // We must wait for https://ains.moe.gov.my specifically — not any moe.gov.my subdomain.
      const isOnAinsFrontend = () => page.url().startsWith('https://ains.moe.gov.my')
      if (!isOnAinsFrontend()) {
        console.log('[login] Waiting for final redirect to ains.moe.gov.my...')
        await page.waitForURL(
          url => url.href.startsWith('https://ains.moe.gov.my'),
          { timeout: 60000 }
        )
        console.log(`[login] Landed on AINS: ${page.url()}`)
      }

      // The addInitScript installed in createSession intercepts sessionStorage.setItem
      // and writes values into window.__nilamCapture the instant Vue sets them.
      // Poll __nilamCapture (100ms) instead of re-reading sessionStorage directly —
      // this fires within one render cycle of the Vue app writing the token.
      const getCapture = (key) => page.evaluate(
        (k) => (window.__nilamCapture && window.__nilamCapture[k]) ||
                sessionStorage.getItem(k) || localStorage.getItem(k),
        key
      ).catch(() => null)

      console.log('[login] Waiting for jb-app-token via capture intercept...')
      await page.waitForFunction(
        () => !!(
          (window.__nilamCapture && window.__nilamCapture['jb-app-token']) ||
          sessionStorage.getItem('jb-app-token') ||
          localStorage.getItem('jb-app-token')
        ),
        { timeout: 30000, polling: 100 }
      ).catch(() => {})

      let ssToken = await getCapture('jb-app-token')

      // Wait for jb-app-user (set asynchronously by the Vuex store after API call)
      console.log('[login] Waiting for jb-app-user...')
      await page.waitForFunction(
        () => !!(
          (window.__nilamCapture && window.__nilamCapture['jb-app-user']) ||
          sessionStorage.getItem('jb-app-user') ||
          localStorage.getItem('jb-app-user')
        ),
        { timeout: 15000, polling: 100 }
      ).catch(() => console.log('[login] jb-app-user did not populate after 15s'))

      const storageInfo = await page.evaluate(() => ({
        url: window.location.href,
        ss: Object.keys(sessionStorage),
        captured: Object.keys(window.__nilamCapture || {}),
      })).catch(() => ({ url: 'unknown', ss: [], captured: [] }))
      console.log(`[login] Storage state: ssToken=${!!ssToken}, url=${storageInfo.url}, ssKeys=${storageInfo.ss.join(',')}, captured=${storageInfo.captured.join(',')}`)

      // If still nothing, re-navigate to AINS root to re-trigger the Vue router
      if (!ssToken) {
        console.warn('[login] jb-app-token still null — re-navigating to AINS root')
        await page.goto(AINS_URL, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {})
        await page.waitForFunction(
          () => !!(
            (window.__nilamCapture && window.__nilamCapture['jb-app-token']) ||
            sessionStorage.getItem('jb-app-token') ||
            localStorage.getItem('jb-app-token')
          ),
          { timeout: 15000, polling: 100 }
        ).catch(() => {})
        ssToken = await getCapture('jb-app-token')
        console.log(`[login] After re-navigate: ssToken=${!!ssToken}`)
      }

      const [ssUser, ssProfile] = await Promise.all([
        getCapture('jb-app-user'),
        getCapture('jb-app-profile'),
      ])

      const cookies = await getCookies(userId)
      console.log(`[login] Session captured: ssToken=${!!ssToken}, ssUser=${!!ssUser}, cookies=${cookies.length}`)

      return { ssToken, ssUser, ssProfile, cookies }
    }

    const result = await Promise.race([captureSession(), captureDeadline])
    await destroySession(userId)
    return result
  } catch (err) {
    await destroySession(userId).catch(() => {})
    throw err
  }
}

module.exports = {
  createSession,
  getSession,
  destroySession,
  getCookies,
  performLogin,
}
