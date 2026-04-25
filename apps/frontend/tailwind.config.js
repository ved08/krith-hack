/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Geist",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
        display: [
          "Instrument Serif",
          "ui-serif",
          "Georgia",
          "Cambria",
          "serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "monospace",
        ],
      },
      colors: {
        // Warm taupe/ink — replaces cool Tailwind slate everywhere it's used.
        slate: {
          50: "#F6F3EC",
          100: "#EDE7D9",
          200: "#DDD4BF",
          300: "#C2B697",
          400: "#9A8E72",
          500: "#736953",
          600: "#564E3D",
          700: "#3E382B",
          800: "#2A2620",
          900: "#1A1814",
          950: "#100E0A",
        },
        // Forest green — calm, scholarly primary.
        primary: {
          50: "#EFF4EF",
          100: "#D7E5D7",
          200: "#B1CBB2",
          300: "#84AA86",
          400: "#5A8460",
          500: "#3F6647",
          600: "#305037",
          700: "#27412D",
          800: "#1F3324",
          900: "#17261B",
        },
        // Warm clay/terracotta — accent for highlights, never decoration.
        accent: {
          50: "#FBF1EB",
          100: "#F4DBCC",
          200: "#E8B59A",
          300: "#D58E6A",
          400: "#BF6E47",
          500: "#A35433",
          600: "#854228",
          700: "#683320",
          800: "#4D261A",
          900: "#321912",
        },
        // Paper for body.
        paper: {
          50: "#FAF7F2",
          100: "#F2EDE2",
          200: "#E6DFCB",
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        // Editorial-tinted gradients (replaces neon blue/purple/pink).
        "gradient-blue":
          "linear-gradient(135deg, #305037 0%, #1F3324 100%)",
        "gradient-purple":
          "linear-gradient(135deg, #3E382B 0%, #1A1814 100%)",
        "gradient-accent":
          "linear-gradient(135deg, #BF6E47 0%, #854228 100%)",
        "paper-grain":
          "radial-gradient(circle at 25% 15%, rgba(0,0,0,0.025) 0px, transparent 1px), radial-gradient(circle at 75% 60%, rgba(0,0,0,0.02) 0px, transparent 1px)",
      },
      boxShadow: {
        subtle: "0 1px 2px 0 rgb(26 24 20 / 0.04)",
        soft: "0 1px 2px 0 rgb(26 24 20 / 0.04), 0 8px 24px -10px rgb(26 24 20 / 0.08)",
        glow: "0 1px 0 0 rgb(255 255 255 / 0.04) inset, 0 8px 24px -8px rgb(48 80 55 / 0.35)",
        "glow-purple": "0 8px 28px -10px rgb(62 56 43 / 0.35)",
        "glow-pink": "0 8px 28px -10px rgb(163 84 51 / 0.35)",
        card: "0 1px 0 0 rgb(26 24 20 / 0.04), 0 12px 28px -16px rgb(26 24 20 / 0.12)",
        ring: "0 0 0 1px rgb(26 24 20 / 0.08)",
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out",
        "slide-up": "slideUp 0.5s ease-out",
        "slide-down": "slideDown 0.35s ease-out",
        "pulse-glow": "pulseGlow 2.4s ease-in-out infinite",
        float: "float 6s ease-in-out infinite",
        shimmer: "shimmer 2s infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(12px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        slideDown: {
          "0%": { transform: "translateY(-8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        pulseGlow: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.85" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-1000px 0" },
          "100%": { backgroundPosition: "1000px 0" },
        },
      },
      spacing: {
        18: "4.5rem",
        22: "5.5rem",
        26: "6.5rem",
        30: "7.5rem",
      },
      borderRadius: {
        "3xl": "1.25rem",
        "4xl": "1.75rem",
      },
      transitionDuration: {
        350: "350ms",
        400: "400ms",
      },
      letterSpacing: {
        editorial: "-0.02em",
      },
    },
  },
  plugins: [],
};
