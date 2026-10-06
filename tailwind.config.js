/** @type {import('tailwindcss').Config} */
export default {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0F766E',
          dark: '#115E59',
          light: '#14B8A6',
          hover: '#115E59',
        },
        accent: {
          amber: '#B45309',
          'amber-light': '#FEF3C7',
        },
        bg: {
          warm: '#FAFAF7',
        },
      },
      animation: {
        in: 'fadeIn 0.3s ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
