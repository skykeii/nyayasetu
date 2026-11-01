import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["'Inter Variable'", "Inter", "system-ui", "sans-serif"] },
      colors: {
        ink: { DEFAULT: "#0A0F1E", 900: "#070B16", 800: "#0E1427", 700: "#141B33" },
        saffron: { DEFAULT: "#FF9933", 300: "#FFC285", 500: "#FF9933", 600: "#E67E1A" },
        indigo2: { DEFAULT: "#6366F1" },
      },
      keyframes: {
        pulseRing: {
          "0%": { boxShadow: "0 0 0 0 rgba(167,139,250,0.55)" },
          "70%": { boxShadow: "0 0 0 10px rgba(167,139,250,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(167,139,250,0)" },
        },
        shimmer: { "100%": { transform: "translateX(100%)" } },
      },
      animation: {
        pulseRing: "pulseRing 1.8s infinite",
        shimmer: "shimmer 1.4s infinite",
      },
    },
  },
  plugins: [],
};
export default config;
