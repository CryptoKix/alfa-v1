/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: {
          primary: '#0a0a0f',
          card: '#12121a',
          elevated: '#1a1a2e',
        },
        accent: {
          cyan: '#00ffff',
          pink: '#ff0080',
          purple: '#9945FF',
          green: '#00ff9d',
          red: '#ff2a6d',
          yellow: '#fbbf24',
        },
        border: '#2a2a3a',
        text: {
          primary: '#ffffff',
          secondary: '#8a8a9a',
          muted: '#5a5a6a',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
        sans: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        'glow-cyan': '0 0 20px rgba(0, 255, 255, 0.3)',
        'glow-pink': '0 0 20px rgba(255, 0, 128, 0.3)',
      },
      animation: {
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}
