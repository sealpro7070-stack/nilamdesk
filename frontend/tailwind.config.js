/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        z: {
          void:       '#0A0A0F',
          card:       '#13131A',
          lift:       '#1A1A24',
          rim:        '#2A2A38',
          green:      '#00FF85',
          'green-d':  '#00CC6A',
          snow:       '#F0F0F8',
          fog:        '#8888A0',
          ash:        '#44445A',
          red:        '#FF4F5E',
          amber:      '#FFB020',
          blue:       '#4F8EFF',
        },
      },
      fontFamily: {
        sans:    ['"DM Sans"', 'sans-serif'],
        display: ['"Space Grotesk"', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        'glow-g':    '0 0 24px rgba(0,255,133,0.28)',
        'glow-g-sm': '0 0 12px rgba(0,255,133,0.18)',
        'glow-r':    '0 0 18px rgba(255,79,94,0.32)',
        'glow-a':    '0 0 18px rgba(255,176,32,0.28)',
        card:        '0 1px 4px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)',
      },
      backgroundImage: {
        'mesh': 'radial-gradient(ellipse 80% 50% at 15% 15%, rgba(0,255,133,0.07) 0%, transparent 55%), radial-gradient(ellipse 60% 40% at 85% 85%, rgba(79,142,255,0.05) 0%, transparent 55%)',
      },
      animation: {
        'float':      'float 5s ease-in-out infinite',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'spin-slow':  'spin 10s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-7px)' },
        },
      },
    },
  },
  plugins: [],
}
