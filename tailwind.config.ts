import type { Config } from "tailwindcss";

/**
 * Warm light theme ("parchment and marigold").
 *
 * The app's components were written for a dark UI (text-white, text-slate-400,
 * bg-white/[0.04], text-emerald-300 ...). Rather than rewrite hundreds of class
 * names, every scale below is declared light-to-dark and then *inverted*, so a
 * class that meant "light text on dark" now means "dark text on light":
 *   text-white      -> walnut ink
 *   text-slate-400  -> muted sand-brown
 *   bg-white/[0.04] -> a faint warm tint on parchment
 *   text-emerald-300-> deep leaf green
 * Solid fills at 500 stay mid-tone, so tinted backgrounds keep working.
 */
const STEPS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"] as const;
type Scale = Record<(typeof STEPS)[number], string>;
const scale = (hex: string[]): Scale => Object.fromEntries(STEPS.map((k, i) => [k, hex[i]])) as Scale;
const invert = (s: Scale): Scale => Object.fromEntries(STEPS.map((k, i) => [k, s[STEPS[STEPS.length - 1 - i]]])) as Scale;

// natural order, light -> dark
const sand = scale(["#FBF8F2", "#F6F0E4", "#ECE3D3", "#DDD0BB", "#B8A994", "#74655A", "#64574A", "#4F4338", "#3B3129", "#2C231C", "#211913"]);
const leaf = scale(["#F0F5EC", "#DCE9D3", "#BDD6AE", "#93BB80", "#6A9C57", "#4C8040", "#3B6731", "#2F5228", "#264120", "#1F3419", "#132010"]);
const brick = scale(["#FCF1EE", "#F8DDD5", "#F0BAAB", "#E58E79", "#D4684F", "#BE4A32", "#A23B27", "#842F21", "#6A271C", "#562118", "#33120D"]);
const turmeric = scale(["#FDF7E8", "#FAEAC4", "#F4D48A", "#EBBA52", "#DD9E2E", "#C2831A", "#9E6813", "#7C5112", "#614013", "#503514", "#2D1D09"]);
const marigold = scale(["#FDF4EA", "#FAE3CC", "#F4C79C", "#EDA466", "#E2843C", "#CC6A22", "#AA5419", "#874217", "#6C3517", "#582C16", "#321609"]);
const mulberry = scale(["#F8F0F5", "#F0DDE8", "#E2BCD1", "#CE92B4", "#B66A96", "#9C4E7C", "#823D66", "#6A3254", "#572A45", "#48253A", "#2A121F"]);
const chakra = scale(["#F0F2F8", "#DDE2F0", "#BFC8E2", "#97A6CD", "#6F81B4", "#53659A", "#42517F", "#364268", "#2D3756", "#262E47", "#171C2C"]);
const teal = scale(["#EDF6F5", "#D2EAE8", "#A6D3D0", "#73B6B3", "#4B9894", "#357D7A", "#2A6563", "#245250", "#204341", "#1D3836", "#0F2120"]);
const clay = scale(["#FCF0F0", "#F8DDDE", "#EFBCC0", "#E29199", "#D06A76", "#B84E5C", "#9A3D4A", "#7E323D", "#672B34", "#56262E", "#321217"]);

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Source Sans 3 Variable'", "'Source Sans 3'", "system-ui", "sans-serif"],
        display: ["'Newsreader Variable'", "Newsreader", "Georgia", "serif"],
      },
      colors: {
        white: "#241B14",
        black: "#241B14",
        paper: "#FFFCF5",
        parchment: "#F6F0E4",
        slate: invert(sand),
        stone: sand,
        emerald: invert(leaf),
        green: invert(leaf),
        red: invert(brick),
        amber: invert(turmeric),
        yellow: invert(turmeric),
        orange: invert(marigold),
        violet: invert(mulberry),
        purple: invert(mulberry),
        fuchsia: invert(clay),
        indigo: invert(chakra),
        blue: invert(chakra),
        sky: invert(teal),
        cyan: invert(teal),
        rose: invert(clay),
        pink: invert(clay),
        ink: { DEFAULT: "#241B14", 900: "#211913", 800: "#2C231C", 700: "#3B3129" },
        saffron: { DEFAULT: "#A6550B", 300: "#9A4F0C", 500: "#C9731A", 600: "#8F470B" },
        indigo2: { DEFAULT: "#42517F" },
      },
      boxShadow: {
        soft: "0 1px 0 rgba(255,255,255,0.7) inset, 0 1px 2px rgba(60,40,20,0.05), 0 8px 24px -12px rgba(80,50,20,0.14)",
        lift: "0 1px 0 rgba(255,255,255,0.7) inset, 0 2px 4px rgba(60,40,20,0.06), 0 18px 40px -18px rgba(80,50,20,0.28)",
      },
      keyframes: {
        pulseRing: {
          "0%": { boxShadow: "0 0 0 0 rgba(156,78,124,0.45)" },
          "70%": { boxShadow: "0 0 0 9px rgba(156,78,124,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(156,78,124,0)" },
        },
        shimmer: { "100%": { transform: "translateX(100%)" } },
      },
      animation: {
        pulseRing: "pulseRing 2.2s infinite",
        shimmer: "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [],
};
export default config;
