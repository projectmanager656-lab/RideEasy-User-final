/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // RideEasy auth theme: black / white / orange-yellow
        night: {
          950: '#05070A',
          900: '#080B10',
          800: '#111418',
          700: '#1A1E24',
          border: '#2A2D32',
        },
        brand: {
          DEFAULT: '#FFA800',
          dark: '#E69500',
          light: '#FFB000',
          soft: '#FFC033',
        },
      },
    },
  },
  plugins: [],
}

