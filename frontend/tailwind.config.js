/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))'
        },
        // Modern Maritime Operations palette — controlled brand accents for the
        // authenticated (post-login) experience. Login screen intentionally
        // does not use these tokens.
        navy: {
          50: '#EEF2F6',
          100: '#DCE4EC',
          200: '#B7C5D6',
          300: '#8FA3BB',
          400: '#5E7A99',
          500: '#3E5D7C',
          600: '#2C4A66',
          700: '#1F3750',
          800: '#152A3E',
          900: '#0E2033',
          950: '#081522',
        },
        brand: {
          50: '#EAF3F9',
          100: '#CFE5F1',
          200: '#9FCBE3',
          300: '#69AED2',
          400: '#3F92BE',
          500: '#1F76A2',
          600: '#175D80',
          700: '#134A67',
          800: '#0F3B52',
          900: '#0C2F41',
        },
        // Vivid ocean cyan — the "Martı Logistics" signature accent. Used
        // intentionally and sparingly (active states, glows, gradients),
        // never as a base surface color.
        cyan: {
          50: '#EAFBFE',
          100: '#CDF3FA',
          200: '#9BE6F4',
          300: '#5CD5EA',
          400: '#22BFDD',
          500: '#0AA5C4',
          600: '#0C86A0',
          700: '#106A80',
          800: '#155365',
          900: '#123F4C',
        },
      },
      boxShadow: {
        'glow-cyan': '0 0 0 1px rgba(10,165,196,0.35), 0 8px 24px -6px rgba(10,165,196,0.45)',
        'glow-cyan-sm': '0 4px 16px -4px rgba(10,165,196,0.5)',
        'brand-lg': '0 24px 48px -20px rgba(8,21,34,0.35)',
      },
      keyframes: {
        'accordion-down': {
          from: {
            height: '0'
          },
          to: {
            height: 'var(--radix-accordion-content-height)'
          }
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)'
          },
          to: {
            height: '0'
          }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out'
      }
    }
  },
  plugins: [require("tailwindcss-animate")],
};