/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "rgb(var(--bg-base) / <alpha-value>)",
          raised: "rgb(var(--bg-raised) / <alpha-value>)",
          overlay: "rgb(var(--bg-overlay) / <alpha-value>)",
          hover: "rgb(var(--bg-hover) / <alpha-value>)",
          inset: "rgb(var(--bg-inset) / <alpha-value>)",
        },
        border: {
          subtle: "rgb(var(--border-subtle) / <alpha-value>)",
          strong: "rgb(var(--border-strong) / <alpha-value>)",
        },
        fg: {
          primary: "rgb(var(--fg-primary) / <alpha-value>)",
          secondary: "rgb(var(--fg-secondary) / <alpha-value>)",
          muted: "rgb(var(--fg-muted) / <alpha-value>)",
          fainter: "rgb(var(--fg-fainter) / <alpha-value>)",
        },
        // Brand is monochrome — no accent hue.
        brand: "rgb(var(--brand) / <alpha-value>)",
        // Data series colors — charts only, never UI chrome.
        accent: {
          green: "#10b981",
          red: "#ef4444",
          amber: "#f59e0b",
          blue: "#38bdf8",
          slate: "#64748b",
        },
      },
      fontFamily: {
        sans: ["Geist", "Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SF Mono", "Menlo", "monospace"],
        display: ["Source Code Pro", "JetBrains Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "var(--shadow-card)",
        "card-hover": "var(--shadow-card-hover)",
      },
      borderRadius: {
        sm: "6px",
        md: "8px",
        lg: "12px",
        xl: "16px",
      },
      animation: {
        aurora: "aurora 60s linear infinite",
      },
      keyframes: {
        aurora: {
          from: { backgroundPosition: "50% 50%, 50% 50%" },
          to: { backgroundPosition: "350% 50%, 350% 50%" },
        },
      },
    },
  },
  plugins: [],
};
