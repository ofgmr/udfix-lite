/** @type {import('tailwindcss').Config} */
/** Legacy shadcn path; Tailwind v4 styling lives in src/index.css + postcss.config.cjs */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
