/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        night: {
          950: '#05070A',
          900: '#080B10',
          800: '#111418',
          700: '#1A1E24',
          border: '#2A2D32',
        },
        brand: {
          DEFAULT: '#FFA800',
          yellow: '#FFC800',
          dark: '#050505',
          light: '#FFB000',
          soft: '#FFC033',
          card: '#111315',
          cardSoft: '#17191B',
          border: '#2A2A2A',
          pickup: '#16C784',
          drop: '#FF4D4D',
        },
        // Theme-aware tokens — resolve from the CSS variables defined in
        // index.css and switch instantly with the data-theme attribute.
        theme: {
          bg: 'rgb(var(--bg) / <alpha-value>)',
          surface: 'rgb(var(--surface) / <alpha-value>)',
          card: 'rgb(var(--card) / <alpha-value>)',
          'card-muted': 'rgb(var(--card-muted) / <alpha-value>)',
          input: 'rgb(var(--input-bg) / <alpha-value>)',
          primary: 'rgb(var(--text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--text-secondary) / <alpha-value>)',
          muted: 'rgb(var(--text-muted) / <alpha-value>)',
          border: 'rgb(var(--border) / <alpha-value>)',
          'border-strong': 'rgb(var(--border-strong) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
}
