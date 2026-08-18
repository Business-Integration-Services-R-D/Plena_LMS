// Custom "Martı" brand mark — no logo asset was supplied to this workspace,
// so this is a bespoke geometric glyph rather than a placeholder icon.
// "Martı" is Turkish for seagull; the glyph abstracts a gull's wingspan into
// the same angular strokes used for wave/route motifs elsewhere in the UI,
// so it reads equally as "wings in flight" or "a course over open water".
// Swap the <path> below for a real logo asset at any time — everywhere this
// component is used will update automatically.
export function MartiGlyph({ className = "w-4 h-4", strokeWidth = 2.3 }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M2.5 15.5 L7.7 7.5 L12 13.5 L16.3 7.5 L21.5 15.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Branded icon badge — gradient navy → cyan container for the glyph. Used as
// the primary mark wherever the product needs a strong, singular brand
// touch-point (sidebar, empty states, auth-adjacent surfaces).
export function MartiBadge({ size = "w-8 h-8", className = "" }) {
  return (
    <div
      className={`${size} rounded-xl bg-gradient-to-br from-cyan-500 to-navy-800 flex items-center justify-center shadow-glow-cyan-sm shrink-0 ${className}`}
    >
      <MartiGlyph className="w-[55%] h-[55%] text-white" />
    </div>
  );
}

// Sidebar co-branding lockup: Martı Denizcilik leads (the organization the
// employee works for), Plena LMS follows as the underlying platform.
export function BrandLockup({ onClick, compact = false }) {
  return (
    <button
      data-testid="sidebar-logo"
      onClick={onClick}
      className={`flex items-center gap-2.5 px-4 shrink-0 w-full text-left ${compact ? "h-14" : "h-16"}`}
    >
      <MartiBadge size={compact ? "w-7 h-7" : undefined} />
      <div className="min-w-0">
        <p className={`font-semibold tracking-tight text-white leading-tight truncate ${compact ? "text-sm" : "text-[15px]"}`}>Martı Denizcilik</p>
        <p className="text-[10px] tracking-[0.08em] text-cyan-300/80 truncate">Powered by Plena LMS</p>
      </div>
    </button>
  );
}
