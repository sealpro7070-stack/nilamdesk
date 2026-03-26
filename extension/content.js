// Content script — runs on ains.moe.gov.my
// Reads the 3 sessionStorage keys the bot needs to inject

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getSessionStorage') {
    sendResponse({
      token:     sessionStorage.getItem('jb-app-token')   || null,
      ssUser:    sessionStorage.getItem('jb-app-user')    || null,
      ssProfile: sessionStorage.getItem('jb-app-profile') || null,
    })
  }
  return true
})
