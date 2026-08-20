/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          yellow: '#FFC800',
          dark: '#050505',
          card: '#111315',
          cardSoft: '#17191B',
          border: '#2A2A2A',
          pickup: '#16C784',
          drop: '#FF4D4D',
        },
      },
    },
  },
  plugins: [],
}