export default function StatusBadge({ status }) {
  const cfg = {
    success: {
      cls: 'bg-z-green/10 text-z-green border-z-green/30 shadow-glow-g-sm',
      dot: 'bg-z-green',
      label: 'Berjaya',
    },
    failed: {
      cls: 'bg-z-red/10 text-z-red border-z-red/30 shadow-glow-r',
      dot: 'bg-z-red',
      label: 'Gagal',
    },
    pending: {
      cls: 'bg-z-amber/10 text-z-amber border-z-amber/30 shadow-glow-a',
      dot: 'bg-z-amber animate-pulse',
      label: 'Pending',
    },
  }

  const c = cfg[status] || { cls: 'bg-z-lift text-z-fog border-z-rim', dot: 'bg-z-ash', label: status }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${c.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.dot}`} />
      {c.label}
    </span>
  )
}
