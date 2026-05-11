/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        gold: {
          50:  '#F6EDD8',
          100: '#F3EDE3',
          200: '#E8D5A3',
          300: '#D4AF37',
          400: '#D4AF37',
          500: '#C9A84C',
          600: '#9B7A2F',
          700: '#8a6824',
          800: '#705323',
          900: '#1C1510',
        },
        cream: {
          DEFAULT: '#FDFCFA',
          2: '#F9F6F1',
          3: '#F3EDE3',
        }
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans:  ['Montserrat', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'sm': '6px',
        'md': '12px',
        'lg': '20px',
        'xl': '28px',
        '2xl': '28px',
      },
      boxShadow: {
        'sm':   '0 2px 12px rgba(201,168,76,0.10)',
        'md':   '0 8px 32px rgba(201,168,76,0.15)',
        'lg':   '0 20px 60px rgba(201,168,76,0.18)',
        'xl':   '0 32px 80px rgba(28,21,16,0.12)',
      },
      animation: {
        'slide-up':   'slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)',
        'slide-in':   'slideIn 0.2s ease-out',
        'fade-in':    'fadeIn 0.25s ease-out',
        'bounce-in':  'bounceIn 0.4s cubic-bezier(0.34,1.56,0.64,1)',
      },
      keyframes: {
        slideUp:  { from: { transform:'translateY(100%)', opacity:0 }, to: { transform:'translateY(0)', opacity:1 } },
        slideIn:  { from: { transform:'translateX(100%)' }, to: { transform:'translateX(0)' } },
        fadeIn:   { from: { opacity:0 }, to: { opacity:1 } },
        bounceIn: { from: { transform:'scale(0.8)', opacity:0 }, to: { transform:'scale(1)', opacity:1 } },
      }
    },
  },
  plugins: [],
}
