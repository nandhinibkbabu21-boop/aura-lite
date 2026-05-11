/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        gold: {
          50:  '#fdf9ef',
          100: '#faf0d3',
          200: '#f5dfa0',
          300: '#efc86a',
          400: '#e8b042',
          500: '#C9A84C',
          600: '#a8852e',
          700: '#8a6824',
          800: '#705323',
          900: '#5c4520',
        },
        brand: {
          50:  '#fdf8f0',
          100: '#f9efd8',
          500: '#C9A84C',
          700: '#8a6824',
          900: '#1C1510',
        }
      },
      fontFamily: {
        serif: ['Georgia', 'Cambria', 'Times New Roman', 'serif'],
        sans:  ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'slide-up':   'slideUp 0.3s ease-out',
        'slide-in':   'slideIn 0.2s ease-out',
        'fade-in':    'fadeIn 0.25s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-in':  'bounceIn 0.4s cubic-bezier(0.34,1.56,0.64,1)',
      },
      keyframes: {
        slideUp:   { from: { transform:'translateY(100%)' }, to: { transform:'translateY(0)' } },
        slideIn:   { from: { transform:'translateX(100%)' }, to: { transform:'translateX(0)' } },
        fadeIn:    { from: { opacity:0 }, to: { opacity:1 } },
        bounceIn:  { from: { transform:'scale(0.8)', opacity:0 }, to: { transform:'scale(1)', opacity:1 } },
      }
    },
  },
  plugins: [],
}
