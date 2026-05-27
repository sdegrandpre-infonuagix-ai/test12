/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './public/index.html',
    './tests/tailwind-smoke.html',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          teal: '#1595b2',
          amber: '#f59e0b',
          red: '#ef4444',
        },
        surface: {
          dark: '#050810',
          'dark-elevated': '#1e293b',
        },
        text: {
          primary: '#e2e8f0',
          muted: '#64748b',
        },
        overlay: {
          'teal-faint': 'rgba(21,149,178,0.08)',
          'teal-soft': 'rgba(21,149,178,0.1)',
          'teal-medium': 'rgba(21,149,178,0.2)',
          'teal-edge': 'rgba(21,149,178,0.3)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        hover: '0 4px 20px rgba(21,149,178,0.12)',
        sheet: '0 -8px 32px rgba(0,0,0,0.4)',
      },
      spacing: {
        1: '4px',
        2: '6px',
        3: '10px',
        4: '14px',
        5: '0.4rem',
        6: '0.6rem',
        7: '0.75rem',
        8: '1rem',
        9: '1.5rem',
      },
    },
  },
  plugins: [],
};
