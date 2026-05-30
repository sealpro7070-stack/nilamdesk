import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ConnectAINSModal from '../components/ConnectAINSModal'
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAIL || '').split(',').map(e => e.trim()).filter(Boolean)
const isAdminEmail = (email) => !!email && ADMIN_EMAILS.includes(email)

export default function Admin() {
  const navigate = useNavigate()
  const [tab, setTab]           = useState('overview') // 'overview' | 'users' | 'payments' | 'referrals' | 'settings'
  const [users, setUsers]       = useState([])
  const [payments, setPayments] = useState([])
  // Referrals state
  const [codes, setCodes]             = useState([])
  const [commissions, setCommissions] = useState([])
  const [commFilter, setCommFilter]   = useState('pending')
  const [newCode, setNewCode]         = useState({ code: '', owner_name: '', owner_contact: '', rate: '10' })
  const [creatingCode, setCreatingCode] = useState(false)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [search, setSearch]     = useState('')
  const [filter, setFilter]     = useState('all')
  const [payFilter, setPayFilter] = useState('pending')
  const [toasting, setToasting] = useState(null)
  const [token, setToken]       = useState('')
  const [connectTarget, setConnectTarget] = useState(null) // { id, email } of user to connect AINS for
  const [roleTarget, setRoleTarget]       = useState(null) // userId being role-changed
  // QR settings state
  const [qrData, setQrData]       = useState(null)   // current saved QR (base64 or URL)
  const [qrPreview, setQrPreview] = useState(null)   // newly picked image preview
  const [qrSaving, setQrSaving]   = useState(false)
  // Receipt lightbox
  const [receiptOpen, setReceiptOpen] = useState(null) // receipt data URL to display
  // Grant-credits modal
  const [grantTarget, setGrantTarget] = useState(null) // { id, email, credits } of user
  const [grantAmount, setGrantAmount] = useState('')
  const [grantNote, setGrantNote]     = useState('')
  const [grantSaving, setGrantSaving] = useState(false)
  const [grantHistory, setGrantHistory] = useState([])
  const [grantHistoryLoading, setGrantHistoryLoading] = useState(false)

  useEffect(() => { checkAdminAndLoad() }, [])
  useEffect(() => { if (tab === 'settings') fetchQrSettings() }, [tab])
  useEffect(() => { if (tab === 'referrals') { fetchCodes(); fetchCommissions() } }, [tab, commFilter])
  useEffect(() => { if (tab === 'overview') fetchCodes() }, [tab])
  useEffect(() => { if (grantTarget) fetchGrantHistory(grantTarget.id); else setGrantHistory([]) }, [grantTarget])

  async function checkAdminAndLoad() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { navigate('/'); return }
    // Admin check is enforced by backend; we just verify the first admin endpoint succeeds
    try {
      const probe = await fetch(`${BACKEND_URL}/api/admin/users`, { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (!probe.ok) { navigate('/dashboard'); return }
    } catch { navigate('/dashboard'); return }
    setToken(session.access_token)
    await Promise.all([fetchUsers(session.access_token), fetchPayments(session.access_token)])
  }

  async function fetchUsers(tok) {
    setLoading(true); setError(null)
    try {
      const freshToken = tok || (await supabase.auth.getSession()).data.session?.access_token || token
      const res = await fetch(`${BACKEND_URL}/api/admin/users`, {
        headers: { Authorization: `Bearer ${freshToken}` }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setUsers(data.users)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  async function fetchPayments(tok) {
    try {
      const freshToken = tok || (await supabase.auth.getSession()).data.session?.access_token || token
      const res = await fetch(`${BACKEND_URL}/api/payments/admin/list`, {
        headers: { Authorization: `Bearer ${freshToken}` }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPayments(data.requests || [])
    } catch (err) { setError(err.message) }
  }

  async function toggleActivate(userId, currentlyActive) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId, activate: !currentlyActive })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: !currentlyActive } : u))
      showToast(!currentlyActive ? 'User activated!' : 'User deactivated.')
    } catch (err) { showToast(err.message, 'error') }
  }

  async function setRole(userId, role) {
    setRoleTarget(userId)
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/set-role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId, role })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setUsers(prev => prev.map(u => u.id === userId ? {
        ...u,
        plan: role,
        is_active: (role === 'plus' || role === 'family' || role === 'tester' || role === 'noob') ? true : u.is_active,
      } : u))
      showToast(`Role set to "${role}" for user`)
    } catch (err) { showToast(err.message, 'error') }
    finally { setRoleTarget(null) }
  }

  async function fetchGrantHistory(userId) {
    setGrantHistoryLoading(true)
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/credit-grants?userId=${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setGrantHistory(data.grants || [])
    } catch { setGrantHistory([]) }
    finally { setGrantHistoryLoading(false) }
  }

  async function grantCredits(e) {
    e.preventDefault()
    const amt = parseInt(grantAmount, 10)
    if (!Number.isInteger(amt) || amt === 0) { showToast('Enter a non-zero whole number', 'error'); return }
    setGrantSaving(true)
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/grant-credits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: grantTarget.id, amount: amt, note: grantNote })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setUsers(prev => prev.map(u => u.id === grantTarget.id ? { ...u, credits: data.user?.credits ?? u.credits } : u))
      showToast(`${amt > 0 ? 'Granted' : 'Deducted'} ${Math.abs(amt)} credits — new balance ${data.user?.credits}`)
      // Keep the modal open and refresh balance + history so the admin sees the log
      setGrantTarget(t => t ? { ...t, credits: data.user?.credits ?? t.credits } : t)
      setGrantAmount(''); setGrantNote('')
      fetchGrantHistory(grantTarget.id)
    } catch (err) { showToast(err.message, 'error') }
    finally { setGrantSaving(false) }
  }

  async function reviewPayment(requestId, action) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/payments/admin/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ requestId, action })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPayments(prev => prev.map(p =>
        p.id === requestId ? { ...p, status: action === 'approve' ? 'approved' : 'rejected' } : p
      ))
      showToast(action === 'approve' ? 'Plan activated!' : 'Request rejected.')
      // Also refresh users so plan column updates
      fetchUsers()
    } catch (err) { showToast(err.message, 'error') }
  }

  // ── Referrals ──────────────────────────────────────────────
  async function fetchCodes() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/referrals/admin/codes`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCodes(data.codes || [])
    } catch (err) { showToast(err.message, 'error') }
  }

  async function fetchCommissions() {
    try {
      const url = `${BACKEND_URL}/api/referrals/admin/commissions${commFilter !== 'all' ? `?status=${commFilter}` : ''}`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCommissions(data.commissions || [])
    } catch (err) { showToast(err.message, 'error') }
  }

  async function createCode(e) {
    e.preventDefault()
    setCreatingCode(true)
    try {
      const res = await fetch(`${BACKEND_URL}/api/referrals/admin/codes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          code: newCode.code,
          owner_name: newCode.owner_name,
          owner_contact: newCode.owner_contact,
          rate: Number(newCode.rate) / 100,
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setNewCode({ code: '', owner_name: '', owner_contact: '', rate: '10' })
      showToast('Referral code created!')
      fetchCodes()
    } catch (err) { showToast(err.message, 'error') }
    finally { setCreatingCode(false) }
  }

  async function toggleCode(code, active) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/referrals/admin/codes/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code, active: !active })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCodes(prev => prev.map(c => c.code === code ? { ...c, active: !active } : c))
    } catch (err) { showToast(err.message, 'error') }
  }

  async function markCommissionPaid(body, label) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/referrals/admin/commissions/mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast(`${label} marked paid (${data.updated})`)
      fetchCommissions(); fetchCodes()
    } catch (err) { showToast(err.message, 'error') }
  }

  async function voidCommission(commissionId) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/referrals/admin/commissions/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ commissionId })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast('Commission voided')
      fetchCommissions(); fetchCodes()
    } catch (err) { showToast(err.message, 'error') }
  }

  async function fetchQrSettings() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/payments/qr-settings`)
      const d = await res.json()
      setQrData(d.qr_data || null)
      setQrPreview(null)
    } catch {}
  }

  function handleQrFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { showToast('Please upload an image file.', 'error'); return }
    if (file.size > 2 * 1024 * 1024) { showToast('Image must be under 2 MB', 'error'); return }
    const reader = new FileReader()
    reader.onload = ev => setQrPreview(ev.target.result)
    reader.readAsDataURL(file)
  }

  async function saveQr() {
    if (!qrPreview) return
    setQrSaving(true)
    try {
      const res = await fetch(`${BACKEND_URL}/api/payments/admin/qr-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ qr_data: qrPreview }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setQrData(qrPreview)
      setQrPreview(null)
      showToast('QR code saved!')
    } catch (err) { showToast(err.message, 'error') }
    finally { setQrSaving(false) }
  }

  function showToast(msg, type = 'success') {
    setToasting({ msg, type })
    setTimeout(() => setToasting(null), 3000)
  }

  const filtered = useMemo(() => users.filter(u => {
    const matchSearch = u.email?.toLowerCase().includes(search.toLowerCase()) ||
                        u.delima_id?.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'all' ? true : filter === 'active' ? u.is_active : !u.is_active
    return matchSearch && matchFilter
  }), [users, search, filter])

  const filteredPayments = useMemo(() => payments.filter(p =>
    payFilter === 'all' ? true : p.status === payFilter
  ), [payments, payFilter])

  const pendingPayCount = payments.filter(p => p.status === 'pending').length

  const stats = {
    total:      users.length,
    active:     users.filter(u => u.is_active).length,
    pending:    users.filter(u => !u.is_active).length,
    withCookie: users.filter(u => u.has_cookie).length,
  }

  // ── Analytics (computed client-side from already-loaded data) ──
  const analytics = useMemo(() => {
    // Last 6 calendar months as { key: 'YYYY-MM', label: 'Mon' }
    const months = []
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleString('en-MY', { month: 'short' }),
      })
    }
    const monthKey = (iso) => {
      const d = new Date(iso)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }

    // Signups per month
    const signupByMonth = Object.fromEntries(months.map(m => [m.key, 0]))
    for (const u of users) {
      if (!u.created_at) continue
      const k = monthKey(u.created_at)
      if (k in signupByMonth) signupByMonth[k]++
    }

    // Revenue per month (approved payments only; amount is in sen)
    const approved = payments.filter(p => p.status === 'approved')
    const revenueByMonth = Object.fromEntries(months.map(m => [m.key, 0]))
    let totalRevenue = 0
    for (const p of approved) {
      const rm = (p.amount || 0) / 100
      totalRevenue += rm
      const k = monthKey(p.created_at)
      if (k in revenueByMonth) revenueByMonth[k] += rm
    }

    const trend = months.map(m => ({
      label: m.label,
      signups: signupByMonth[m.key],
      revenue: Math.round(revenueByMonth[m.key] * 100) / 100,
    }))

    // Plan mix
    const planCounts = {}
    for (const u of users) {
      const p = u.plan || 'free'
      planCounts[p] = (planCounts[p] || 0) + 1
    }
    const planMix = Object.entries(planCounts).map(([name, value]) => ({ name, value }))

    // Top referrers (from codes' stats)
    const topReferrers = [...(codes || [])]
      .map(c => ({ code: c.code, name: c.owner_name, signups: c.stats?.signups ?? 0, orders: c.stats?.orders ?? 0 }))
      .sort((a, b) => b.orders - a.orders || b.signups - a.signups)
      .slice(0, 5)

    return { trend, planMix, topReferrers, totalRevenue, approvedCount: approved.length }
  }, [users, payments, codes])

  const PLAN_COLORS = {
    free: '#94A3B8', plus: '#6366F1', family: '#10B981', tester: '#EAB308', noob: '#A855F7',
  }

  return (
    <div className="min-h-screen bg-page">
      {/* Header */}
      <div className="bg-white border-b border-line px-6 py-5 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl font-extrabold text-heading">Admin Panel</h1>
            <p className="text-muted text-sm mt-0.5">User management &amp; approvals</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => { fetchUsers(); fetchPayments() }} className="btn-ghost text-sm py-2 px-4">Refresh</button>
            <button onClick={() => navigate('/dashboard')} className="btn-ghost text-sm py-2 px-4">← Dashboard</button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Users',      value: stats.total,      cls: 'bg-brand-50 text-brand-700 border-brand-100' },
            { label: 'Active',           value: stats.active,     cls: 'bg-ok-50 text-ok-700 border-ok-100' },
            { label: 'Pending Approval', value: stats.pending,    cls: 'bg-warn-50 text-warn-600 border-warn-100' },
            { label: 'Pending Payments', value: pendingPayCount,  cls: pendingPayCount > 0 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-gray-50 text-gray-600 border-gray-200' },
          ].map(s => (
            <div key={s.label} className={`rounded-card p-4 border ${s.cls}`}>
              <div className="font-display text-3xl font-extrabold">{s.value}</div>
              <div className="text-sm mt-1 font-semibold opacity-80">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-5 border-b border-line">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'users',    label: 'Users' },
            { id: 'payments', label: `Payments${pendingPayCount > 0 ? ` (${pendingPayCount})` : ''}` },
            { id: 'referrals', label: 'Referrals' },
            { id: 'settings', label: 'Settings' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-5 py-2.5 text-sm font-bold border-b-2 transition-colors -mb-px ${
                tab === t.id
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-muted hover:text-heading'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Overview tab ── */}
        {tab === 'overview' && (
          <div className="space-y-6">
            {/* Revenue KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total Revenue', value: `RM${analytics.totalRevenue.toFixed(2)}`, cls: 'bg-ok-50 text-ok-700 border-ok-100' },
                { label: 'Paid Orders', value: analytics.approvedCount, cls: 'bg-brand-50 text-brand-700 border-brand-100' },
                { label: 'Active Users', value: stats.active, cls: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
                { label: 'AINS Connected', value: stats.withCookie, cls: 'bg-amber-50 text-amber-700 border-amber-100' },
              ].map(s => (
                <div key={s.label} className={`rounded-card p-4 border ${s.cls}`}>
                  <div className="font-display text-2xl font-extrabold">{s.value}</div>
                  <div className="text-sm mt-1 font-semibold opacity-80">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Trends */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="card-p">
                <h3 className="font-display text-sm font-bold text-heading mb-3">Signups (last 6 months)</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={analytics.trend}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#94A3B8" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#94A3B8" width={28} />
                    <Tooltip />
                    <Bar dataKey="signups" fill="#6366F1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="card-p">
                <h3 className="font-display text-sm font-bold text-heading mb-3">Revenue RM (last 6 months)</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={analytics.trend}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#94A3B8" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#94A3B8" width={36} />
                    <Tooltip formatter={v => `RM${Number(v).toFixed(2)}`} />
                    <Line type="monotone" dataKey="revenue" stroke="#10B981" strokeWidth={2.5} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Plan mix + Top referrers */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="card-p">
                <h3 className="font-display text-sm font-bold text-heading mb-3">Plan mix</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={analytics.planMix} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={e => `${e.name} (${e.value})`}>
                      {analytics.planMix.map(p => (
                        <Cell key={p.name} fill={PLAN_COLORS[p.name] || '#CBD5E1'} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="card-p">
                <h3 className="font-display text-sm font-bold text-heading mb-3">Top referrers</h3>
                {analytics.topReferrers.length === 0 ? (
                  <p className="text-sm text-muted py-8 text-center">No referral codes yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs font-bold text-muted uppercase tracking-wide border-b border-line">
                        <th className="py-2">Code</th>
                        <th className="py-2 text-center">Signups</th>
                        <th className="py-2 text-center">Orders</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.topReferrers.map(r => (
                        <tr key={r.code} className="border-b border-line/50">
                          <td className="py-2.5">
                            <div className="font-mono font-bold text-heading">{r.code}</div>
                            <div className="text-xs text-muted">{r.name}</div>
                          </td>
                          <td className="py-2.5 text-center text-muted">{r.signups}</td>
                          <td className="py-2.5 text-center font-bold text-heading">{r.orders}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Users tab ── */}
        {tab === 'users' && (
          <>
            <div className="flex flex-col sm:flex-row gap-3 mb-5">
              <input
                type="text"
                placeholder="Search by email or Delima ID…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="input flex-1"
              />
              <div className="flex gap-2">
                {['all', 'pending', 'active'].map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all capitalize ${
                      filter === f
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-white border-line text-muted hover:border-brand-300 hover:text-brand-600'
                    }`}
                  >{f}</button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-line border-t-brand-600 rounded-full animate-spin" />
              </div>
            ) : error ? (
              <div className="card-p text-center py-12 text-danger-600">{error}</div>
            ) : filtered.length === 0 ? (
              <div className="card-p text-center py-12 text-muted">No users found.</div>
            ) : (
              <div className="card p-0 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-line text-left">
                      <th className="px-5 py-3 text-xs font-bold text-muted uppercase tracking-wide">User</th>
                      <th className="px-5 py-3 text-xs font-bold text-muted uppercase tracking-wide hidden md:table-cell">Plan</th>
                      <th className="px-5 py-3 text-xs font-bold text-muted uppercase tracking-wide text-center">Credits</th>
                      <th className="px-5 py-3 text-xs font-bold text-muted uppercase tracking-wide hidden md:table-cell">Cookie</th>
                      <th className="px-5 py-3 text-xs font-bold text-muted uppercase tracking-wide hidden md:table-cell">Records</th>
                      <th className="px-5 py-3 text-xs font-bold text-muted uppercase tracking-wide">Joined</th>
                      <th className="px-5 py-3 text-xs font-bold text-muted uppercase tracking-wide text-center">Status</th>
                      <th className="px-5 py-3 text-xs font-bold text-muted uppercase tracking-wide text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((user, i) => (
                      <tr key={user.id} className={`border-b border-line/50 hover:bg-brand-50/30 transition-colors ${i === filtered.length - 1 ? 'border-0' : ''}`}>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                              {(user.email || '?')[0].toUpperCase()}
                            </div>
                            <div>
                              <div className="font-semibold text-heading max-w-[180px] truncate">{user.email}</div>
                              <div className="text-xs text-muted md:hidden">{user.delima_id || '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 hidden md:table-cell">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full capitalize ${
                            user.plan === 'family' ? 'bg-ok-100 text-ok-700' :
                            user.plan === 'plus'   ? 'bg-brand-100 text-brand-700' :
                            user.plan === 'noob'   ? 'bg-purple-100 text-purple-700' :
                            user.plan === 'tester' ? 'bg-yellow-100 text-yellow-700' :
                                                     'bg-gray-100 text-gray-600'
                          }`}>{user.plan || 'free'}{user.plan === 'noob' ? ' 🧪' : user.plan === 'tester' ? ' 🔬' : ''}</span>
                        </td>
                        <td className="px-5 py-4 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className="font-bold text-heading text-sm tabular-nums">{user.credits ?? 0}</span>
                            <button
                              onClick={() => { setGrantTarget({ id: user.id, email: user.email, credits: user.credits ?? 0 }); setGrantAmount(''); setGrantNote('') }}
                              className="text-xs font-semibold text-brand-600 hover:underline"
                            >Grant</button>
                          </div>
                        </td>
                        <td className="px-5 py-4 hidden md:table-cell">
                          {user.has_cookie
                            ? <span className="text-ok-600 font-semibold text-xs">✓ Saved</span>
                            : <span className="text-subtle text-xs">Not saved</span>}
                        </td>
                        <td className="px-5 py-4 hidden md:table-cell text-muted text-xs">
                          {user.submissions_success} / {user.submissions_total}
                        </td>
                        <td className="px-5 py-4 text-subtle text-xs">
                          {user.created_at ? new Date(user.created_at).toLocaleDateString('en-MY') : '—'}
                        </td>
                        <td className="px-5 py-4 text-center">
                          {user.is_active ? (
                            <span className="inline-flex items-center gap-1 bg-ok-100 text-ok-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                              <span className="w-1.5 h-1.5 bg-ok-500 rounded-full" /> Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-warn-100 text-warn-600 text-xs font-semibold px-2.5 py-1 rounded-full">
                              <span className="w-1.5 h-1.5 bg-warn-500 rounded-full" /> Pending
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-center">
                          <div className="flex flex-col items-center gap-1">
                            {isAdminEmail(user.email) ? (
                              <span className="text-xs text-brand-500 font-bold">👑 Admin</span>
                            ) : (
                              <>
                                {/* Role selector */}
                                <select
                                  value={user.plan || 'free'}
                                  disabled={roleTarget === user.id}
                                  onChange={e => setRole(user.id, e.target.value)}
                                  className="text-xs font-semibold px-2 py-1 rounded-lg border border-line bg-white text-heading w-full max-w-[110px] cursor-pointer disabled:opacity-50"
                                >
                                  <option value="free">Free</option>
                                  <option value="plus">Plus</option>
                                  <option value="family">Family</option>
                                  <option value="tester">Tester 🔬</option>
                                  <option value="noob">Noob 🧪</option>
                                </select>
                                <button
                                  onClick={() => toggleActivate(user.id, user.is_active)}
                                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition w-full max-w-[110px] ${
                                    user.is_active
                                      ? 'bg-danger-50 text-danger-600 hover:bg-danger-100'
                                      : 'bg-brand-600 text-white hover:bg-brand-700'
                                  }`}
                                >
                                  {user.is_active ? 'Deactivate' : 'Approve'}
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => setConnectTarget({ id: user.id, email: user.email })}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100 transition w-full max-w-[110px]"
                            >
                              {user.has_cookie ? 'Reconnect AINS' : 'Connect AINS'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── Payments tab ── */}
        {tab === 'payments' && (
          <>
            <div className="flex gap-2 mb-5">
              {['pending', 'approved', 'rejected', 'all'].map(f => (
                <button
                  key={f}
                  onClick={() => setPayFilter(f)}
                  className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all capitalize ${
                    payFilter === f
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-white border-line text-muted hover:border-brand-300 hover:text-brand-600'
                  }`}
                >{f}</button>
              ))}
            </div>

            {filteredPayments.length === 0 ? (
              <div className="card-p text-center py-12 text-muted">No payment requests found.</div>
            ) : (
              <div className="space-y-3">
                {filteredPayments.map(pr => (
                  <div key={pr.id} className="card-p flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-heading text-sm truncate">
                          {pr.users?.email || (pr.user_id?.slice(0, 8) ?? '') + '…'}
                        </span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full capitalize ${
                          pr.plan === 'family' ? 'bg-ok-100 text-ok-700' : 'bg-brand-100 text-brand-700'
                        }`}>{pr.plan}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          pr.status === 'pending'  ? 'bg-amber-100 text-amber-700' :
                          pr.status === 'approved' ? 'bg-ok-100 text-ok-700' :
                                                     'bg-danger-100 text-danger-700'
                        }`}>{pr.status}</span>
                      </div>
                      <div className="text-xs text-muted mt-1 flex flex-wrap gap-3">
                        <span>RM{(pr.amount / 100).toFixed(2)}{pr.type === 'credit_topup' ? ' top-up' : '/year'}</span>
                        <span>{new Date(pr.created_at).toLocaleString('en-MY')}</span>
                        {pr.reference && <span>Ref: <strong className="text-heading">{pr.reference}</strong></span>}
                        {pr.reviewed_by && <span>Reviewed by: {pr.reviewed_by}</span>}
                        {pr.receipt_data && (
                          <button
                            onClick={() => setReceiptOpen(pr.receipt_data)}
                            className="text-brand-600 hover:underline font-semibold"
                          >
                            View Receipt 🖼
                          </button>
                        )}
                      </div>
                    </div>
                    {pr.status === 'pending' && (
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => reviewPayment(pr.id, 'approve')}
                          className="text-xs font-bold px-4 py-2 bg-ok-500 text-white rounded-lg hover:bg-ok-600 transition"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => reviewPayment(pr.id, 'reject')}
                          className="text-xs font-bold px-4 py-2 bg-danger-50 text-danger-600 rounded-lg hover:bg-danger-100 transition"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {/* ── Referrals tab ── */}
        {tab === 'referrals' && (
          <div className="space-y-8">
            {/* Create code */}
            <div className="card-p">
              <h2 className="font-display text-base font-bold text-heading mb-1">Create Referral Code</h2>
              <p className="text-xs text-muted mb-4">Give a marketer a code. They share <code className="text-brand-600">nilamdesk.vercel.app/?ref=CODE</code>. You earn nothing; they earn the rate on each referred user's first paid order.</p>
              <form onSubmit={createCode} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text" placeholder="Code (e.g. AISHA)" value={newCode.code}
                  onChange={e => setNewCode(n => ({ ...n, code: e.target.value.toUpperCase() }))}
                  className="input" required
                />
                <input
                  type="text" placeholder="Marketer name" value={newCode.owner_name}
                  onChange={e => setNewCode(n => ({ ...n, owner_name: e.target.value }))}
                  className="input" required
                />
                <input
                  type="text" placeholder="Contact (phone / email, optional)" value={newCode.owner_contact}
                  onChange={e => setNewCode(n => ({ ...n, owner_contact: e.target.value }))}
                  className="input"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="number" min="0" max="100" step="1" placeholder="Rate %" value={newCode.rate}
                    onChange={e => setNewCode(n => ({ ...n, rate: e.target.value }))}
                    className="input flex-1"
                  />
                  <span className="text-sm text-muted font-semibold">% commission</span>
                </div>
                <button
                  type="submit" disabled={creatingCode}
                  className="sm:col-span-2 py-2.5 bg-brand-600 text-white rounded-xl font-bold text-sm hover:bg-brand-700 disabled:opacity-50 transition-colors"
                >
                  {creatingCode ? 'Creating…' : 'Create Code'}
                </button>
              </form>
            </div>

            {/* Codes list */}
            <div>
              <h2 className="font-display text-base font-bold text-heading mb-3">Marketers</h2>
              {codes.length === 0 ? (
                <div className="card-p text-center py-8 text-muted text-sm">No referral codes yet.</div>
              ) : (
                <div className="card p-0 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-line text-left">
                        <th className="px-5 py-3 text-xs font-bold text-muted uppercase tracking-wide">Code</th>
                        <th className="px-5 py-3 text-xs font-bold text-muted uppercase tracking-wide">Marketer</th>
                        <th className="px-5 py-3 text-xs font-bold text-muted uppercase tracking-wide text-center">Rate</th>
                        <th className="px-5 py-3 text-xs font-bold text-muted uppercase tracking-wide text-center hidden sm:table-cell">Signups</th>
                        <th className="px-5 py-3 text-xs font-bold text-muted uppercase tracking-wide text-center hidden sm:table-cell">Orders</th>
                        <th className="px-5 py-3 text-xs font-bold text-muted uppercase tracking-wide text-right">Owed</th>
                        <th className="px-5 py-3 text-xs font-bold text-muted uppercase tracking-wide text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {codes.map((c, i) => (
                        <tr key={c.code} className={`border-b border-line/50 ${i === codes.length - 1 ? 'border-0' : ''}`}>
                          <td className="px-5 py-4">
                            <div className="font-mono font-bold text-heading">{c.code}</div>
                            <button
                              onClick={() => {
                                navigator.clipboard?.writeText(`${window.location.origin}/m?token=${c.view_token}`)
                                showToast('Marketer dashboard link copied')
                              }}
                              className="text-xs font-semibold text-brand-600 hover:underline mt-0.5"
                            >Copy dashboard link</button>
                          </td>
                          <td className="px-5 py-4">
                            <div className="font-semibold text-heading">{c.owner_name}</div>
                            {c.owner_contact && <div className="text-xs text-muted">{c.owner_contact}</div>}
                          </td>
                          <td className="px-5 py-4 text-center text-muted">{Math.round(c.rate * 100)}%</td>
                          <td className="px-5 py-4 text-center text-muted hidden sm:table-cell">{c.stats?.signups ?? 0}</td>
                          <td className="px-5 py-4 text-center text-muted hidden sm:table-cell">{c.stats?.orders ?? 0}</td>
                          <td className="px-5 py-4 text-right">
                            <span className="font-bold text-heading">RM{(c.stats?.pending_total ?? 0).toFixed(2)}</span>
                            {(c.stats?.pending_total ?? 0) > 0 && (
                              <button
                                onClick={() => markCommissionPaid({ code: c.code }, c.code)}
                                className="block ml-auto mt-1 text-xs font-bold text-ok-600 hover:underline"
                              >Pay all</button>
                            )}
                          </td>
                          <td className="px-5 py-4 text-center">
                            <button
                              onClick={() => toggleCode(c.code, c.active)}
                              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
                                c.active ? 'bg-ok-50 text-ok-700 hover:bg-ok-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                              }`}
                            >{c.active ? 'Active' : 'Disabled'}</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Commissions */}
            <div>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h2 className="font-display text-base font-bold text-heading">Commissions</h2>
                <div className="flex gap-2">
                  {['pending', 'paid', 'void', 'all'].map(f => (
                    <button
                      key={f}
                      onClick={() => setCommFilter(f)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all capitalize ${
                        commFilter === f
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-white border-line text-muted hover:border-brand-300 hover:text-brand-600'
                      }`}
                    >{f}</button>
                  ))}
                </div>
              </div>
              {commissions.length === 0 ? (
                <div className="card-p text-center py-8 text-muted text-sm">No commissions found.</div>
              ) : (
                <div className="space-y-3">
                  {commissions.map(cm => (
                    <div key={cm.id} className="card-p flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-heading text-sm">{cm.code}</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full capitalize ${
                            cm.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                            cm.status === 'paid'    ? 'bg-ok-100 text-ok-700' :
                                                      'bg-gray-100 text-gray-500'
                          }`}>{cm.status}</span>
                        </div>
                        <div className="text-xs text-muted mt-1 flex flex-wrap gap-3">
                          <span>From: {cm.users?.email || (cm.referred_user_id?.slice(0, 8) ?? '') + '…'}</span>
                          <span>Order RM{Number(cm.order_amount).toFixed(2)}</span>
                          <span className="font-bold text-heading">Commission RM{Number(cm.commission_amount).toFixed(2)}</span>
                          <span>{new Date(cm.created_at).toLocaleDateString('en-MY')}</span>
                        </div>
                      </div>
                      {cm.status === 'pending' && (
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => markCommissionPaid({ commissionId: cm.id }, cm.code)}
                            className="text-xs font-bold px-4 py-2 bg-ok-500 text-white rounded-lg hover:bg-ok-600 transition"
                          >Mark Paid</button>
                          <button
                            onClick={() => voidCommission(cm.id)}
                            className="text-xs font-bold px-4 py-2 bg-danger-50 text-danger-600 rounded-lg hover:bg-danger-100 transition"
                          >Void</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Settings tab ── */}
        {tab === 'settings' && (
          <div className="max-w-md space-y-6">
            <div className="card-p">
              <h2 className="font-display text-base font-bold text-heading mb-1">TNG eWallet QR Code</h2>
              <p className="text-xs text-muted mb-4">This QR is shown to users on the payment screen. Upload a new image to replace it.</p>

              {/* Current QR */}
              <div className="mb-4">
                <p className="text-xs font-bold text-muted uppercase tracking-wide mb-2">Current QR</p>
                {qrData ? (
                  <img src={qrData} alt="Current TNG QR" className="w-48 h-48 object-contain rounded-xl border border-line" />
                ) : (
                  <div className="w-48 h-48 bg-gray-100 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-2">
                    <span className="text-3xl">📷</span>
                    <p className="text-xs text-muted text-center px-4">No QR uploaded yet</p>
                  </div>
                )}
              </div>

              {/* Upload new QR */}
              <div className="space-y-3">
                <p className="text-xs font-bold text-muted uppercase tracking-wide">Upload New QR</p>
                <label className="flex flex-col items-center justify-center w-full border-2 border-dashed border-line rounded-xl p-5 cursor-pointer hover:border-brand-400 hover:bg-brand-50/30 transition-colors">
                  {qrPreview ? (
                    <img src={qrPreview} alt="New QR preview" className="w-48 h-48 object-contain rounded-lg" />
                  ) : (
                    <>
                      <span className="text-3xl mb-2">📤</span>
                      <span className="text-sm font-semibold text-muted">Click to select image (max 2 MB)</span>
                    </>
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={handleQrFile} />
                </label>
                {qrPreview && (
                  <div className="flex gap-2">
                    <button
                      onClick={saveQr}
                      disabled={qrSaving}
                      className="flex-1 py-2.5 bg-brand-600 text-white rounded-xl font-bold text-sm hover:bg-brand-700 disabled:opacity-50 transition-colors"
                    >
                      {qrSaving ? 'Saving…' : 'Save QR Code'}
                    </button>
                    <button
                      onClick={() => setQrPreview(null)}
                      className="px-4 py-2.5 border border-line rounded-xl text-muted text-sm font-bold hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Grant Credits modal */}
      {grantTarget && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => !grantSaving && setGrantTarget(null)}
        >
          <form
            onSubmit={grantCredits}
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-card shadow-card-md w-full max-w-sm p-6 space-y-4"
          >
            <div>
              <h2 className="font-display text-base font-bold text-heading">Grant Credits</h2>
              <p className="text-xs text-muted mt-0.5 truncate">{grantTarget.email}</p>
              <p className="text-xs text-muted mt-1">Current balance: <strong className="text-heading">{grantTarget.credits}</strong> credits</p>
            </div>
            <div>
              <label className="text-xs font-bold text-muted uppercase tracking-wide">Amount</label>
              <input
                type="number" step="1" autoFocus
                placeholder="e.g. 150 (use −10 to deduct)"
                value={grantAmount}
                onChange={e => setGrantAmount(e.target.value)}
                className="input w-full mt-1"
              />
              <p className="text-[11px] text-subtle mt-1">Positive adds, negative deducts (balance can't go below 0).</p>
            </div>
            <div>
              <label className="text-xs font-bold text-muted uppercase tracking-wide">Note (optional)</label>
              <input
                type="text" maxLength={500}
                placeholder="Reason for this grant"
                value={grantNote}
                onChange={e => setGrantNote(e.target.value)}
                className="input w-full mt-1"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="submit" disabled={grantSaving}
                className="flex-1 py-2.5 bg-brand-600 text-white rounded-xl font-bold text-sm hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >{grantSaving ? 'Saving…' : 'Apply'}</button>
              <button
                type="button" onClick={() => setGrantTarget(null)} disabled={grantSaving}
                className="px-4 py-2.5 border border-line rounded-xl text-muted text-sm font-bold hover:bg-gray-50 disabled:opacity-50"
              >Cancel</button>
            </div>

            {/* Grant history */}
            <div className="border-t border-line pt-3">
              <p className="text-xs font-bold text-muted uppercase tracking-wide mb-2">Recent grants</p>
              {grantHistoryLoading ? (
                <p className="text-xs text-subtle">Loading…</p>
              ) : grantHistory.length === 0 ? (
                <p className="text-xs text-subtle">No manual grants yet.</p>
              ) : (
                <ul className="space-y-1.5 max-h-40 overflow-y-auto">
                  {grantHistory.map(g => (
                    <li key={g.id} className="flex items-start justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <span className="text-muted">{new Date(g.created_at).toLocaleDateString('en-MY')}</span>
                        {g.note && <span className="text-subtle truncate"> · {g.note}</span>}
                        <div className="text-subtle truncate">by {g.granted_by}</div>
                      </div>
                      <span className={`font-bold tabular-nums flex-shrink-0 ${g.amount > 0 ? 'text-ok-600' : 'text-danger-600'}`}>
                        {g.amount > 0 ? '+' : ''}{g.amount}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </form>
        </div>
      )}

      {/* Receipt Lightbox */}
      {receiptOpen && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setReceiptOpen(null)}
        >
          <div className="relative max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setReceiptOpen(null)}
              className="absolute -top-10 right-0 text-white/70 hover:text-white text-3xl leading-none"
            >×</button>
            <img src={receiptOpen} alt="Payment receipt" className="w-full rounded-2xl shadow-2xl object-contain max-h-[80vh]" />
          </div>
        </div>
      )}

      {/* Toast */}
      {toasting && (
        <div className={`fixed bottom-5 right-5 px-5 py-3 rounded-xl shadow-card-md text-sm font-semibold text-white transition z-50 ${
          toasting.type === 'error' ? 'bg-danger-500' : 'bg-ok-500'
        }`}>
          {toasting.msg}
        </div>
      )}

      {/* Admin AINS connect modal — can connect for any user */}
      {connectTarget && (
        <ConnectAINSModal
          targetUserId={connectTarget.id}
          isOpen={true}
          onClose={() => setConnectTarget(null)}
          onSuccess={() => {
            showToast(`AINS connected for ${connectTarget.email}`)
            setConnectTarget(null)
            fetchUsers()
          }}
        />
      )}
    </div>
  )
}
