/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
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
          red: "#ef4444",
          blue: "#3b82f6",
          amber: "#f59e0b",
          purple: "#a855f7",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 0 rgba(255,255,255,0.03), 0 4px 16px rgba(0,0,0,0.4)",
      },
    },
  },
  plugins: [],
};
