import { RouteRule } from "./Decoration";
import maritimeHero from "@/assets/brand/maritime-hero.jpg";

// Shared welcome banner used at the top of authenticated landing pages
// (/admin, /trainings). Real text content on the left, the maritime
// photograph fading in from the right so it reads as part of the surface
// rather than a pasted rectangle. Purely presentational — no data, no
// functionality — so both pages can share one visual language while each
// page's content below stays true to its own purpose (operational vs.
// spacious/learning-focused).
export function HeroBanner({ overline, title, subtitle, testId, action }) {
  return (
    <div
      data-testid={testId}
      className="relative overflow-hidden rounded-2xl border border-navy-900/8 bg-gradient-to-br from-white via-[#F4F9FC] to-[#EAF3FA] shadow-[0_20px_45px_-28px_rgba(14,32,51,0.22)] mb-10"
    >
      <div className="relative z-10 px-8 sm:px-10 py-9 sm:py-11 max-w-md">
        {overline && (
          <div className="flex items-center gap-2 mb-3">
            <p className="text-[11px] uppercase tracking-[0.2em] font-semibold text-cyan-700">{overline}</p>
            <RouteRule className="w-8" />
          </div>
        )}
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-navy-950">{title}</h1>
        {subtitle && <p className="text-[15px] text-slate-500 mt-2.5 leading-relaxed">{subtitle}</p>}
        {action && <div className="mt-5">{action}</div>}
      </div>
      <div className="absolute inset-y-0 right-0 w-[64%] sm:w-[58%] hidden sm:block overflow-hidden">
        <img
          src={maritimeHero}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover object-right"
        />
        {/* Fixed-width blend strip (not a % of the image) so the photo stays
            large and the fade reads as a deliberate, consistent seam instead
            of a wide, empty-looking gap on wider banners. */}
        <div
          className="absolute inset-y-0 left-0 w-16 sm:w-24"
          style={{ background: "linear-gradient(to right, #EAF3FA, rgba(234,243,250,0))" }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
