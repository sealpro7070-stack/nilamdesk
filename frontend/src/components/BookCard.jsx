import StatusBadge from './StatusBadge'

const LANG_STYLE = {
  Melayu:   'bg-z-green/10 text-z-green',
  Inggeris: 'bg-z-blue/10 text-z-blue',
  Cina:     'bg-z-red/10 text-z-red',
  Tamil:    'bg-z-amber/10 text-z-amber',
}

export default function BookCard({ submission }) {
  const book = submission.books
  const date = submission.submitted_at
    ? new Date(submission.submitted_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'

  const langStyle = LANG_STYLE[book?.language] || 'bg-z-lift text-z-fog'

  return (
    <div className="flex items-start gap-3.5 py-3.5 border-b border-z-rim last:border-0">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-mono text-xs font-bold ${langStyle}`}>
        {book?.language?.[0] || '?'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-z-snow truncate">{book?.title || 'Unknown'}</p>
        <p className="text-xs text-z-fog mt-0.5">{book?.author}</p>
      </div>
      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        <StatusBadge status={submission.status} />
        <span className="font-mono text-xs text-z-ash">{date}</span>
      </div>
    </div>
  )
}
