/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "Liberation Mono", "Courier New", "monospace"],
      },

      colors: {
        // Backgrounds
        "bg-page": "#0E121A",
        "bg-surface-1": "#161B22",
        "bg-surface-2": "#11151C",
        "bg-surface-3": "#1C2129",

        // Borders
        "border-subtle": "#2A3039",
        "border-strong": "#39404A",

        // Text
        "text-primary": "#F0F2F5",
        "text-secondary": "#C5CAD3",
        "text-muted": "#8B8F99",
        "text-disabled": "#5D6168",

        // Neon Accents
        "accent-blue": "#4A56FF",
        "accent-purple": "#AD33FF",

        // Neon Highlights
        "highlight-yellow": "#F8C445",
        "highlight-blue": "#4A90E2",
        "highlight-turquoise": "#3CC8C0",
        "highlight-purple": "#A45CFF",
        "highlight-pink": "#FF3FB0",

        // Status
        success: "#2ECC71",
        warning: "#F8C445",
        danger: "#E74C3C",
        info: "#4A90E2",
      },

      backgroundImage: {
        "accent-gradient": "linear-gradient(90deg, #4A56FF, #AD33FF)",
      },

      borderRadius: {
        card: "16px",
        input: "12px",
      },

      boxShadow: {
        card: "0 4px 20px rgba(0,0,0,0.35)",
      },
    },
  },
  plugins: [],
};
