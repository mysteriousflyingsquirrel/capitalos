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

      fontSize: {
        // Custom typography system (20% larger)
        header1: "1.20rem",
        header2: "1.08rem",
        header3: "0.96rem",
        header4: "0.72rem",

        text1: "0.96rem",
        text2: "0.72rem",

        // Override Tailwind defaults to be 20% larger
        xs: "0.90rem",      // was 0.75rem * 1.2
        sm: "1.05rem",      // was 0.875rem * 1.2
        base: "1.20rem",    // was 1rem * 1.2
        lg: "1.35rem",      // was 1.125rem * 1.2
        xl: "1.50rem",      // was 1.25rem * 1.2
        "2xl": "1.80rem",   // was 1.5rem * 1.2
        "3xl": "2.25rem",   // was 1.875rem * 1.2
        "4xl": "2.70rem",   // was 2.25rem * 1.2
      },

      fontWeight: {
        bold: "700",
        normal: "400",
      },
    },
  },
  plugins: [
    function({ addUtilities, theme, addComponents }) {
      const utilities = {
        ".header1": {
          fontSize: theme("fontSize.header1"),
          fontWeight: theme("fontWeight.bold"),
          color: theme("colors.text-secondary"),
          letterSpacing: "-0.01em",
        },
        ".header2": {
          fontSize: theme("fontSize.header2"),
          fontWeight: theme("fontWeight.bold"),
          color: theme("colors.text-secondary"),
          letterSpacing: "-0.01em",
        },
        ".header3": {
          fontSize: theme("fontSize.header3"),
          fontWeight: theme("fontWeight.bold"),
          color: theme("colors.text-secondary"),
          letterSpacing: "-0.01em",
        },
        ".header4": {
          fontSize: theme("fontSize.header4"),
          fontWeight: theme("fontWeight.bold"),
          color: theme("colors.text-secondary"),
          letterSpacing: "-0.01em",
        },
        ".text1": {
          fontSize: theme("fontSize.text1"),
          fontWeight: theme("fontWeight.normal"),
          color: theme("colors.text-secondary"),
        },
        ".text2": {
          fontSize: theme("fontSize.text2"),
          fontWeight: theme("fontWeight.normal"),
          color: theme("colors.text-muted"),
        },
      };
      
      addUtilities(utilities);
      
      // Add responsive variants for desktop (lg breakpoint)
      addUtilities({
        "@media (min-width: 1024px)": {
          ".header1": {
            fontSize: "1.44rem",
          },
          ".header2": {
            fontSize: "1.30rem",
          },
          ".header3": {
            fontSize: "1.15rem",
          },
          ".header4": {
            fontSize: "0.86rem",
          },
          ".text1": {
            fontSize: "1.15rem",
          },
          ".text2": {
            fontSize: "0.86rem",
          },
        },
      });
    }
  ],
};
