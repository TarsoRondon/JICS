/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./public/**/*.{html,js}",
    "./src/**/*.{js,ts}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#e8f7f3',
          100: '#c5ebe0',
          200: '#9cdcca',
          300: '#6fcbb0',
          400: '#3eb995',
          500: '#18a57f',
          600: '#0c8b68',
          700: '#0a7055',
          800: '#085844',
          900: '#064536'
        },
        surface: {
          base: '#0f1f2a',
          panel: '#132a39',
          subtle: '#1a3443'
        },
        accent: '#4fd1c5'
      },
      boxShadow: {
        card: '0 18px 50px rgba(0,0,0,.18)',
        hover: '0 10px 30px rgba(0,0,0,.22)'
      },
      borderRadius: {
        xl: '14px',
        '2xl': '18px'
      }
    },
  },
  plugins: [],
}
