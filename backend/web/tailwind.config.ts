import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        sea: {
          50: "#f0f7f8",
          100: "#d9ecef",
          200: "#b3d7de",
          300: "#7fb8c4",
          400: "#4d93a3",
          500: "#347788",
          600: "#2b5f6e",
          700: "#264e5a",
          800: "#24414b",
          900: "#213840",
          950: "#12242b",
        },
        sand: {
          50: "#faf7f2",
          100: "#f2ebe0",
          200: "#e4d4bf",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
