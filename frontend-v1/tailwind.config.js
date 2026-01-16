/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: {
          primary: '#000000',
          card: '#050505',
          elevated: '#0a0a0a',
        },
        accent: {
          cyan: '#00FFEA',
          pink: '#FF0080',
          purple: '#BD00FF',
          green: '#00FF00',
          red: '#FF0000',
          yellow: '#FFFF00',
        },
        border: '#333333',
        text: {
          primary: '#ffffff',
          secondary: '#a0a0a0',
          muted: '#505050',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
        sans: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        'glow-cyan': '0 0 20px rgba(0, 255, 234, 0.5)',
        'glow-pink': '0 0 20px rgba(255, 0, 128, 0.5)',
        'floating': '0 0 50px rgba(255, 255, 255, 1)',
      },
      animation: {
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}
