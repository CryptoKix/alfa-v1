/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: {
          primary: '#000000',
          card: '#0a0a0a',
          elevated: '#111111',
        },
        accent: {
          pink: '#ff00ff',
          cyan: '#00ffff',
          purple: '#9945FF',
          green: '#00ff9d',
          red: '#ff2a6d',
          yellow: '#fbbf24',
        },
        border: '#1a1a1a',
        text: {
          primary: '#ffffff',
          secondary: '#888888',
          muted: '#555555',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
        sans: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        'glow-pink': '0 0 15px rgba(255, 0, 255, 0.2)',
        'glow-cyan': '0 0 15px rgba(0, 255, 255, 0.15)',
      },
      animation: {
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}
