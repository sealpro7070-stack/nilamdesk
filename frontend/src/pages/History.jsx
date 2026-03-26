import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import StatusBadge from '../components/StatusBadge'

const BACKEND   = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
const PAGE_SIZE = 15
const MONTHS    = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const FILTERS   = [
  { key: 'all',     label: 'Semua' },
  { key: 'success', label: 'Berjaya' },
  { key: 'pending', label: 'Pending' },
  { key: 'failed',  label: 'Gagal' },
]
const LANG_STYLE = {
  Melayu:   'bg-z-green/10 text-z-green',
  Inggeris: 'bg-z-blue/10 text-z-blue',
  Cina:     'bg-z-red/10 text-z-red',
  Tamil:    'bg-z-amber/10 text-z-amber',
}

export default function History() {
  const [user, setUser]             = useState(null)
  const [submissions, setSubmissions] = useState([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(0)
  const [loading, setLoading]       = useState(true)
  const [filterStatus, setFilterStatus] = useState('all')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user))
  }, [])

  useEffect(() => {
    if (!user) return
    setLoading(true)
    fetch(`${BACKEND}/api/history?userId=${user.id}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`)
      .then(r => r.json())
      .then(data => { setSubmissions(data.submissions || []); setTotal(data.total || 0); setLoading(false) })
      .catch(() => setLoading(false))
  }, [user, page])

  const filtered   = filterStatus === 'all' ? submissions : submissions.filter(s => s.status === filterStatus)
  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="space-y-5"
    >
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-extrabold text-z-snow">Sejarah Penyerahan</h1>
        <p className="text-z-fog text-sm mt-1 font-mono">{total} rekod</p>
      </div>

      {/* Filter bar */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilterStatus(f.key)}
            className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all duration-150 ${
              filterStatus === f.key
                ? 'bg-z-green text-z-void border-z-green shadow-glow-g-sm'
                : 'bg-z-lift text-z-fog border-z-rim hover:border-z-green/40 hover:text-z-green'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-2 border-z-rim border-t-z-green rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Mobile: Timeline */}
          <div className="sm:hidden relative pl-6">
            <div className="absolute left-2 top-2 bottom-2 w-px bg-z-rim" />
            {filtered.map((s, i) => {
              const dotColor = s.status === 'success' ? 'bg-z-green shadow-glow-g-sm' :
                               s.status === 'failed'  ? 'bg-z-red shadow-glow-r' :
                               'bg-z-amber shadow-glow-a animate-pulse'
              return (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="relative mb-3"
                >
                  <div className={`absolute -left-[1.15rem] top-5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotColor}`} />
                  <div className="card py-4 px-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-z-snow text-sm truncate">{s.books?.title || '—'}</p>
                        <p className="text-xs text-z-fog mt-0.5">{s.books?.author}</p>
                      </div>
                      <StatusBadge status={s.status} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-2.5">
                      {s.books?.language && (
                        <span className={`text-xs font-bold rounded-lg px-2 py-0.5 ${LANG_STYLE[s.books.language] || 'bg-z-lift text-z-fog'}`}>
                          {s.books.language}
                        </span>
                      )}
                      {s.month && <span className="font-mono text-xs text-z-fog">{MONTHS[s.month - 1]} {s.year}</span>}
                      {s.submitted_at && (
                        <span className="font-mono text-xs text-z-ash">
                          {new Date(s.submitted_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                    </div>
                    {s.error_message && <p className="text-xs text-z-red mt-1.5 truncate font-mono">{s.error_message}</p>}
                  </div>
                </motion.div>
              )
            })}
          </div>

          {/* Desktop: table */}
          <div className="hidden sm:block card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-z-rim bg-z-lift/50">
                  <th className="text-left px-6 py-4 text-xs font-bold text-z-fog uppercase tracking-widest">Buku</th>
                  <th className="text-left px-4 py-4 text-xs font-bold text-z-fog uppercase tracking-widest">Bahasa</th>
                  <th className="text-left px-4 py-4 text-xs font-bold text-z-fog uppercase tracking-widest hidden md:table-cell">Tempoh</th>
                  <th className="text-left px-4 py-4 text-xs font-bold text-z-fog uppercase tracking-widest">Status</th>
                  <th className="text-left px-4 py-4 text-xs font-bold text-z-fog uppercase tracking-widest hidden lg:table-cell">Tarikh</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => (
                  <motion.tr
                    key={s.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.03 }}
                    className={`border-b border-z-rim/50 hover:bg-z-lift/40 transition-colors ${i === filtered.length - 1 ? 'border-0' : ''}`}
                  >
                    <td className="px-6 py-4">
                      <p className="font-semibold text-z-snow">{s.books?.title || '—'}</p>
                      <p className="text-xs text-z-fog mt-0.5">{s.books?.author}</p>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`text-xs font-bold rounded-lg px-2.5 py-1 ${LANG_STYLE[s.books?.language] || 'bg-z-lift text-z-fog'}`}>
                        {s.books?.language || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell font-mono text-xs text-z-fog">
                      {s.month ? `${MONTHS[s.month - 1]} ${s.year}` : '—'}
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge status={s.status} />
                      {s.error_message && (
                        <p className="text-xs text-z-red mt-1 max-w-xs truncate font-mono">{s.error_message}</p>
                      )}
                    </td>
                    <td className="px-4 py-4 hidden lg:table-cell font-mono text-xs text-z-ash">
                      {s.submitted_at
                        ? new Date(s.submitted_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '—'}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="font-mono text-sm text-z-fog">
            Halaman {page + 1} / {totalPages}
          </p>
          <div className="flex gap-2">
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="btn-ghost text-sm py-2 px-4 disabled:opacity-30">
              ← Sebelum
            </button>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="btn-ghost text-sm py-2 px-4 disabled:opacity-30">
              Seterusnya →
            </button>
          </div>
        </div>
      )}
    </motion.div>
  )
}

function EmptyState() {
  return (
    <div className="card flex flex-col items-center justify-center py-16 gap-4">
      <div className="relative">
        <div className="w-16 h-16 bg-z-lift border border-z-rim rounded-2xl flex items-center justify-center text-z-ash">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
      </div>
      <div className="text-center">
        <p className="font-display font-bold text-z-fog text-lg">Tiada rekod dijumpai</p>
        <p className="text-z-ash text-sm mt-1">Cuba penapis yang lain atau hantar beberapa buku dahulu.</p>
      </div>
    </div>
  )
}
