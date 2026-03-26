const DEFAULT_BACKEND = ''

const statusDot  = document.getElementById('status-dot')
const statusText = document.getElementById('status-text')
const emailInput = document.getElementById('email')
const saveBtn    = document.getElementById('save-btn')
const msgEl      = document.getElementById('msg')
const backendInput      = document.getElementById('backend-url')
const saveSettingsBtn   = document.getElementById('save-settings-btn')
const settingsToggle    = document.getElementById('settings-toggle')
const settingsSection   = document.getElementById('settings-section')

// ── Load saved settings ───────────────────────────────────────────────
chrome.storage.local.get(['email', 'backendUrl'], ({ email, backendUrl }) => {
  if (email)      emailInput.value = email
  if (backendUrl) backendInput.value = backendUrl
})

// ── Check current tab ─────────────────────────────────────────────────
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  const onAins = tab?.url?.includes('ains.moe.gov.my')

  if (onAins) {
    statusDot.className  = 'dot green'
    statusText.textContent = 'You are on ains.moe.gov.my — ready to save session.'
    saveBtn.disabled = false
  } else {
    statusDot.className  = 'dot orange'
    statusText.textContent = 'Open ains.moe.gov.my and log in first, then come back here.'
    saveBtn.disabled = true
  }
})

// ── Settings toggle ───────────────────────────────────────────────────
settingsToggle.addEventListener('click', () => {
  settingsSection.classList.toggle('open')
})

saveSettingsBtn.addEventListener('click', () => {
  const url = backendInput.value.trim().replace(/\/$/, '')
  if (url) {
    chrome.storage.local.set({ backendUrl: url })
    showMsg('Settings saved!', 'success')
  }
})

// ── Save session ──────────────────────────────────────────────────────
saveBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim()
  if (!email) { showMsg('Enter your Nilam Auto email first.', 'error'); return }

  chrome.storage.local.get(['backendUrl'], async ({ backendUrl }) => {
    const backend = (backendUrl || DEFAULT_BACKEND).replace(/\/$/, '')
    if (!backend) {
      showMsg('Set your backend URL in settings below.', 'error')
      settingsSection.classList.add('open')
      return
    }

    // Show loading state
    saveBtn.disabled = true
    saveBtn.innerHTML = '<div class="spinner"></div> Saving…'
    clearMsg()

    try {
      // Save email for next time
      chrome.storage.local.set({ email })

      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

      // 1. Get sessionStorage values via content script
      let ssData = {}
      try {
        ssData = await chrome.tabs.sendMessage(tab.id, { action: 'getSessionStorage' })
      } catch {
        // Content script not injected yet — inject and retry
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
        ssData = await chrome.tabs.sendMessage(tab.id, { action: 'getSessionStorage' })
      }

      if (!ssData?.token) {
        showMsg('No AINS session found. Make sure you are logged in to ains.moe.gov.my first.', 'error')
        return
      }

      // 2. Get all cookies for both AINS domains
      const [c1, c2] = await Promise.all([
        chrome.cookies.getAll({ domain: 'ains.moe.gov.my' }),
        chrome.cookies.getAll({ domain: 'ains-api.moe.gov.my' }),
      ])
      const allCookies = [...c1, ...c2]

      // 3. POST to backend
      const res = await fetch(`${backend}/api/auth/save-cookie`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIdentifier: email,
          cookie:    ssData.token,
          ssUser:    ssData.ssUser,
          ssProfile: ssData.ssProfile,
          cookies:   allCookies,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')

      showMsg('Session saved! Nilam Auto is now connected.', 'success')
    } catch (err) {
      showMsg('Error: ' + err.message, 'error')
    } finally {
      saveBtn.disabled = false
      saveBtn.innerHTML = `
        <svg width="16" height="16" fill="none" stroke="white" stroke-width="2.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/>
        </svg>
        Save Session`
    }
  })
})

function showMsg(text, type) {
  msgEl.textContent = text
  msgEl.className = `msg ${type}`
}
function clearMsg() {
  msgEl.className = 'msg'
  msgEl.textContent = ''
}
