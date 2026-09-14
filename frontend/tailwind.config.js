/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        archive: {
          bg: '#0b0f19',
          card: 'rgba(15, 23, 42, 0.65)',
          border: '#1e293b',
          blue: '#38bdf8',
          cyan: '#06b6d4',
          pink: '#f472b6',
          glow: 'rgba(56, 189, 248, 0.25)',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Courier New', 'monospace'],
      },
      boxShadow: {
        'glow-sm': '0 0 15px rgba(56, 189, 248, 0.15)',
        'glow-md': '0 0 25px rgba(56, 189, 248, 0.25)',
        'glow-pink': '0 0 20px rgba(244, 114, 182, 0.25)',
      }
    },
  },
  plugins: [],
}
