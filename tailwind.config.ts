import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Connect HQ brand — violet, anchored on the logo purple (#4d2a98),
        // which lands between brand-700 and brand-900.
        brand: {
          50: "#f5f3ff",
          100: "#ede9fe",
          200: "#ddd6fe",
          300: "#c4b5fd",
          400: "#a78bfa",
          500: "#7c3aed",
          600: "#6d28d9",
          700: "#5b21b6",
          800: "#4c1d95",
          900: "#3b1478",
        },
        // Charcoal from the logo's "C" / wordmark — for dark surfaces & headings.
        charcoal: {
          700: "#3a3a39",
          800: "#2c2c2b",
          900: "#1f1f1e",
        },
      },
    },
  },
  plugins: [],
};
export default config;
