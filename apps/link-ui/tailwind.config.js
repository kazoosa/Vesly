/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "#0a0e1a",
          raised: "#111827",
          overlay: "#1a2235",
          hover: "#1f2937",
        },
        border: {
          subtle: "#1e293b",
          strong: "#334155",
        },
        accent: {
          green: "#10b981",
        },
        brand: {
          DEFAULT: "#10b981",
          accent: "#10b981",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
