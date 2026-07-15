import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Connect HQ brand — indigo-violet (Option D): a softer, bluer take that
        // still complements the logo purple. Primary (600) = #4f46e5.
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
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
