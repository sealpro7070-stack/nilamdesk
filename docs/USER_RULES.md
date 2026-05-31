# NilamDesk — Rules for Users

This is a plain-language summary of every rule that affects what users can and can't do on NilamDesk. NilamDesk automatically submits NILAM reading records to AINS on a user's behalf.

---

## 1. Credits are the real limit

- **Credits are the single source of truth for how many books you can submit.** 1 credit = 1 successfully submitted book.
- Credits are **only deducted when a submission succeeds.** Failed/timed-out submissions cost nothing.
- Credits **do not expire** and are **not reset** when your plan period ends. If you bought credits, they stay until you use them.
- New users get **1 free credit** on signup.
- Buy more credits any time on the **Upgrade** page. (RM49.90/year = 150 book credits.)

## 2. Daily safety cap: 30 books per day

- To keep accounts safe and avoid looking automated, NilamDesk submits **at most 30 books per day per account** (and per family slot).
- This is based on the **Malaysian calendar day (MYT, UTC+8)** — the counter resets at midnight Malaysian time.
- If you have more credits than 30, the leftover credits **carry over to the next day** automatically. Nothing is lost.
- This cap applies to everyone except admin.

## 3. Plans

| Plan | Free book allowance | Notes |
|------|--------------------|-------|
| **Free** | 1 free book per week | Resets every Monday (MYT). Beyond that, spend credits. |
| **Plus / Paid** | — | Volume = credits you hold, up to 30/day. |
| **Family** | — | Up to 3 child "slots", each its own AINS account. Credits are shared across slots; each slot still capped at 30/day. |
| **Noob (tester)** | 999 | Admin-granted tester role, never expires. |
| **Admin** | Unlimited | No caps, no rate limits. |

- Your plan controls **features** (e.g. Family slots) and the **free weekly book** — it no longer caps how many credits you can spend.
- When a paid plan period ends you revert to "free" features, **but your purchased credits remain usable.**

## 4. How a submission run works

1. You pick how many books and which language, then press submit.
2. The bot checks, in order:
   - **Daily cap** — have you already hit 30 books today? If yes → stops with "Daily limit reached."
   - **Credits** — do you have credits (or your 1 free weekly book if on Free)? If none → stops with "Out of credits."
   - **Duplicates** — books you already submitted this period are skipped so you don't submit the same book twice.
3. It submits up to the smallest of: what you asked for, your remaining credits, and your remaining daily allowance.
4. You're charged 1 credit per book that succeeds.

### Messages you might see
- **"Daily limit reached (max 30 books/day). Your remaining credits will carry over — try again tomorrow."** — you hit today's safety cap; come back tomorrow.
- **"You're out of book credits."** — top up on the Upgrade page.
- **"Already submitted your 1 free book this week..."** — Free plan weekly book used; resets Monday or top up credits.
- **"Nothing to do — you've already submitted everything available right now."** — no new books left to submit for now.

## 5. Rate limits (anti-spam)

- **5 submission runs per user per hour.** (Admin and noob testers are exempt.)
- **5 AINS connection attempts per user per hour.**
- These are separate from the 30/day book cap — they limit how often you press the button, not how many books total.

## 6. AINS account connection

- You must connect your AINS account (via "Connect AINS Account") before submitting. The session is encrypted and stored.
- If your AINS session expires, you'll be asked to reconnect.
- Each AINS account can only be linked to **one** NilamDesk account or family slot (no sharing/duplicates).

## 7. Account activation

- Your account must be **active** to submit. Free signups are active by default; paid features require an approved payment.

## 8. Payments

- Pay via DuitNow/TNG QR shown on the Upgrade page. Upload your receipt.
- An admin reviews and approves the payment, then your plan/credits are granted.
- Receipt uploads are capped at ~5 MB.

## 9. Referrals (for marketers)

- Marketers get a referral code and share `nilamdesk.vercel.app/?ref=CODE`.
- They earn commission (default 10%) on a referred user's **first approved paid order only** (plan upgrades, not credit top-ups).
- Payouts are handled manually by admin.
