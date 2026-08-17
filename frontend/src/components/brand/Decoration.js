// Subtle, reusable maritime decoration primitives. Kept purely decorative
// (aria-hidden, pointer-events-none) so they never affect layout, a11y, or
// functionality — pure visual seasoning for the "Modern Maritime Operations"
// brand direction.
import { useId } from "react";

// Faint repeating wave line, used as a low-opacity background flourish
// (sidebar footer, page-header backdrops, empty states). Intentionally
// subtle — a rhythm, not an illustration.
export function WaveLine({ className = "" }) {
  return (
    <svg
      viewBox="0 0 400 24"
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M0 12 C 25 2, 50 22, 75 12 S 125 2, 150 12 S 200 22, 225 12 S 275 2, 300 12 S 350 22, 375 12 S 400 12, 400 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Short "route" divider: a dashed line with a small terminus dot, evoking a
// navigation course. Used under eyebrow labels / section headers.
export function RouteRule({ className = "w-12 h-px" }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`} aria-hidden="true">
      <span className="flex-1 h-px bg-gradient-to-r from-cyan-500 to-transparent" />
    </span>
  );
}

// Small inline "wave squiggle" glyph — a lightweight decorative punctuation
// mark used right after headings/titles (e.g. "Hoş geldiniz 〜"), echoing the
// maritime motif without relying on any literal icon set.
export function WaveGlyph({ className = "w-5 h-5 text-cyan-500" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M2 15c1.8 0 2.7-2.2 4.5-2.2S9 15 10.8 15s2.7-2.2 4.5-2.2S18 15 19.8 15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Faint world-map dot grid — echoes the map/route motif from the maritime
// photography elsewhere in the product without depicting an actual map.
// Ultra-low-opacity, decorative only.
export function MapDots({ className = "" }) {
  const patternId = `marti-map-dots-${useId()}`;
  return (
    <svg viewBox="0 0 120 60" className={className} aria-hidden="true">
      <defs>
        <pattern id={patternId} width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.7" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="120" height="60" fill={`url(#${patternId})`} />
    </svg>
  );
}

// Compact "ocean" banner: an abstract gradient + wave-line panel that stands
// in for photographic hero imagery (no real ship/photo assets exist in this
// workspace, and generic stock photography would undercut the brand rather
// than support it). Used as training-card thumbnails and small header
// accents wherever the reference mood calls for a "scene", not a swatch.
export function OceanBanner({ className = "h-24 rounded-t-[13px]", children }) {
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br from-navy-900 via-navy-800 to-cyan-800 ${className}`}>
      <MapDots className="absolute inset-0 w-full h-full text-white/[0.07]" />
      <div className="absolute inset-0 opacity-25 text-cyan-300">
        <WaveLine className="w-[140%] h-10 absolute top-3 -left-4" />
        <WaveLine className="w-[140%] h-10 absolute top-9 -left-8" />
        <WaveLine className="w-[140%] h-10 absolute top-[calc(100%-1.75rem)] -left-4" />
      </div>
      <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-cyan-400/20 blur-2xl" />
      {children}
    </div>
  );
}

// Large, ultra-low-opacity corner wave used as a page-level backdrop accent
// behind headers. Purely atmospheric.
export function CornerWaves({ className = "" }) {
  return (
    <svg
      viewBox="0 0 200 200"
      className={`pointer-events-none select-none ${className}`}
      aria-hidden="true"
    >
      <path
        d="M-10 60 C 30 20, 60 100, 100 60 S 170 20, 210 60"
        fill="none"
        stroke="currentColor"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d="M-10 100 C 30 60, 60 140, 100 100 S 170 60, 210 100"
        fill="none"
        stroke="currentColor"
        strokeWidth="10"
        strokeLinecap="round"
      />
    </svg>
  );
}
