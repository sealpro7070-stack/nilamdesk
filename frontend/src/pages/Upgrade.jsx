import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

const FREE_FEATURES = [
  { label: '1 buku / bulan',          yes: false },
  { label: '1 bahasa sahaja',          yes: false },
  { label: 'Sejarah 7 hari',           yes: false },
  { label: 'Hantar manual sahaja',     yes: false },
  { label: 'Auto-jadual bulanan',      yes: false },
  { label: 'Pemberitahuan status',     yes: false },
]

const PRO_FEATURES = [
  { label: 'Sehingga 8 buku / bulan',   yes: true },
  { label: 'Semua 4 bahasa',             yes: true },
  { label: 'Sejarah penuh',              yes: true },
  { label: 'Auto-jadual bulanan',        yes: true },
  { label: 'Pemberitahuan status',       yes: true },
  { label: 'Sokongan keutamaan',         yes: true },
]

export default function Upgrade() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-z-void flex flex-col items-center justify-center px-5 py-16 relative overflow-hidden">

      {/* Background glow blobs */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-z-green/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-80 h-80 bg-z-blue/4 rounded-full blur-3xl pointer-events-none" />

      {/* Back button */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={() => navigate('/dashboard')}
        className="absolute top-6 left-6 flex items-center gap-2 text-sm font-semibold text-z-fog hover:text-z-snow transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        Kembali
      </motion.button>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-12 relative"
      >
        <div className="inline-flex items-center gap-2 bg-z-green/10 border border-z-green/25 text-z-green text-xs font-bold px-3 py-1.5 rounded-full mb-5">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732l-3.354 1.935-1.18 4.455a1 1 0 01-1.933 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732l3.354-1.935 1.18-4.455A1 1 0 0112 2z" clipRule="evenodd" />
          </svg>
          Nilam Auto Pro
        </div>

        <h1 className="font-display text-4xl sm:text-5xl font-extrabold text-z-snow leading-tight">
          Buka Kunci NILAM<br />
          <span className="text-z-green">Sepenuhnya.</span>
        </h1>
        <p className="text-z-fog text-lg mt-4 max-w-md mx-auto">
          Hantar sehingga 8 buku sebulan dalam semua bahasa — secara automatik. Kurang dari harga kopi.
        </p>

        {/* Price */}
        <div className="mt-8 inline-block">
          <div className="bg-z-card border border-z-green/25 rounded-2xl px-8 py-5 relative">
            <div className="absolute inset-0 rounded-2xl bg-z-green/3 pointer-events-none" />
            <div className="relative">
              <span className="font-mono text-z-fog text-sm">Hanya</span>
              <div className="flex items-end justify-center gap-2 mt-1">
                <span className="font-display text-6xl font-extrabold text-z-green" style={{ textShadow: '0 0 30px rgba(0,255,133,0.4)' }}>RM18</span>
                <span className="text-z-fog text-lg mb-2 font-semibold">/ tahun</span>
              </div>
              <p className="text-z-ash text-xs font-mono mt-1">≈ RM1.50 sebulan · kurang dari kopi</p>
            </div>
          </div>
        </div>

        {/* Trust signals */}
        <div className="flex flex-wrap justify-center gap-4 mt-6 text-xs text-z-fog font-semibold">
          <span className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-z-green" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
            Lebih 1,000 pelajar Malaysia
          </span>
          <span className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-z-green" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
            Data disulitkan AES-256
          </span>
          <span className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-z-green" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
            Batal bila-bila masa
          </span>
        </div>
      </motion.div>

      {/* Comparison table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="w-full max-w-2xl"
      >
        <div className="grid sm:grid-cols-2 gap-4 mb-8">
          {/* Free column */}
          <div className="card">
            <p className="text-z-fog font-bold text-sm mb-1">Percuma</p>
            <p className="font-display text-3xl font-extrabold text-z-snow mb-4">RM0</p>
            <ul className="space-y-3">
              {FREE_FEATURES.map(f => (
                <li key={f.label} className="flex items-center gap-2.5 text-sm text-z-fog">
                  <svg className="w-4 h-4 text-z-ash flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  {f.label}
                </li>
              ))}
            </ul>
          </div>

          {/* Pro column */}
          <div className="card-glow relative overflow-hidden">
            <div className="absolute -right-8 -top-8 w-32 h-32 bg-z-green/8 rounded-full blur-2xl pointer-events-none" />
            <div className="relative">
              <p className="text-z-green font-bold text-sm mb-1">Pro</p>
              <p className="font-display text-3xl font-extrabold text-z-snow mb-4">RM18 / tahun</p>
              <ul className="space-y-3">
                {PRO_FEATURES.map(f => (
                  <li key={f.label} className="flex items-center gap-2.5 text-sm text-z-snow">
                    <svg className="w-4 h-4 text-z-green flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    {f.label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* CTA */}
        <button className="btn-primary w-full py-4 text-lg">
          Dapatkan Pro — RM18 / Tahun
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </button>

        <p className="text-center text-z-ash text-xs mt-4 font-mono">
          Pembayaran selamat. Soalan? Hubungi kami melalui e-mel.
        </p>
      </motion.div>
    </div>
  )
}
