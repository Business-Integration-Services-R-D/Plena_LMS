import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutDashboard, Users, HelpCircle, Clapperboard, Send, BarChart3, Mail, LogOut, BookOpen,
} from "lucide-react";
import { BrandLockup } from "@/components/brand/MartiMark";
import { WaveLine, RouteRule, WaveGlyph } from "@/components/brand/Decoration";

const adminNav = [
  { to: "/admin", label: "Genel Bakış", icon: LayoutDashboard, end: true },
  { to: "/admin/users", label: "Kullanıcılar & Gruplar", icon: Users },
  { to: "/admin/questions", label: "Soru Havuzu", icon: HelpCircle },
  { to: "/admin/trainings", label: "Eğitimler", icon: Clapperboard },
  { to: "/admin/assignments", label: "Atamalar", icon: Send },
];

const adminNav2 = [
  { to: "/admin/reports", label: "Raporlar", icon: BarChart3 },
  { to: "/admin/notifications", label: "Bildirimler", icon: Mail },
];

const employeeNav = [{ to: "/trainings", label: "Eğitimlerim", icon: BookOpen }];

// Vertical "route line" running behind the nav icon column — a wayfinding
// motif (course markers) rather than a literal logistics illustration.
const NavGroup = ({ label, items }) => (
  <div className="space-y-0.5">
    <p className="px-2.5 pb-1.5 text-[10px] uppercase tracking-[0.14em] font-semibold text-navy-400">{label}</p>
    <div className="relative">
      <div className="absolute left-[19px] top-1 bottom-1 w-px bg-gradient-to-b from-cyan-500/25 via-white/[0.07] to-transparent" aria-hidden="true" />
      <div className="space-y-0.5">
        {items.map((item) => <NavItem key={item.to} item={item} />)}
      </div>
    </div>
  </div>
);

const NavItem = ({ item }) => (
  <NavLink
    to={item.to}
    end={item.end}
    data-testid={`nav-${item.to.replace(/\//g, "-").slice(1)}`}
    className={({ isActive }) =>
      `relative flex items-center gap-2.5 px-2.5 py-[8px] rounded-lg text-[13px] font-medium transition-all ${
        isActive
          ? "bg-gradient-to-r from-white/[0.1] to-white/[0.03] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] before:absolute before:left-[-10px] before:top-1/2 before:-translate-y-1/2 before:h-4 before:w-[3px] before:rounded-full before:bg-cyan-400 before:shadow-[0_0_10px_rgba(34,191,221,0.8)]"
          : "text-navy-300 hover:bg-white/[0.05] hover:text-white"
      }`
    }
  >
    {({ isActive }) => (
      <>
        <item.icon className={`w-4 h-4 shrink-0 relative z-10 ${isActive ? "text-cyan-300" : ""}`} strokeWidth={1.8} />
        <span className="relative z-10">{item.label}</span>
      </>
    )}
  </NavLink>
);

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";

  return (
    <div className="min-h-screen bg-[#F4F7FA] flex">
      <aside className="w-64 shrink-0 bg-gradient-to-b from-navy-950 via-navy-950 to-[#081826] flex flex-col fixed inset-y-0 z-20 overflow-hidden">
        {/* Ambient brand glow + wave rhythm — atmospheric only, no literal iconography */}
        <div className="absolute -top-24 -right-20 w-56 h-56 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" aria-hidden="true" />
        <div className="absolute bottom-0 inset-x-0 h-40 pointer-events-none opacity-[0.07] text-cyan-300" aria-hidden="true">
          <WaveLine className="w-full h-8 absolute bottom-24" />
          <WaveLine className="w-full h-8 absolute bottom-14" />
          <WaveLine className="w-full h-8 absolute bottom-4" />
        </div>

        <div className="relative z-10 flex flex-col h-full">
          <BrandLockup onClick={() => navigate(isAdmin ? "/admin" : "/trainings")} />

          <div className="px-4 pb-3 mb-2">
            <div className="h-px bg-gradient-to-r from-cyan-500/40 via-white/10 to-transparent" />
          </div>

          <nav className="flex-1 px-2.5 space-y-6 overflow-y-auto">
            {isAdmin ? (
              <>
                <NavGroup label="Çalışma Alanı" items={adminNav} />
                <NavGroup label="Analiz" items={adminNav2} />
              </>
            ) : (
              <NavGroup label="Eğitim" items={employeeNav} />
            )}
          </nav>

          <div className="p-2.5">
            <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-white/[0.06] border border-white/[0.08]">
              {user?.picture ? (
                <img src={user.picture} alt={user.name} className="w-7 h-7 rounded-full object-cover ring-2 ring-cyan-500/30" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500 to-navy-700 flex items-center justify-center text-[11px] font-semibold text-white ring-2 ring-cyan-500/20">
                  {user?.name?.[0]?.toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[12.5px] font-medium text-white truncate leading-tight" data-testid="sidebar-user-name">{user?.name}</p>
                <p className="text-[10.5px] text-navy-400 truncate">{user?.role === "admin" ? "Yönetici" : "Çalışan"}</p>
              </div>
              <button
                data-testid="logout-btn"
                onClick={logout}
                className="p-1.5 rounded-md text-navy-400 hover:text-white hover:bg-white/[0.08] transition-colors"
                title="Çıkış Yap"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </aside>
      <main className="flex-1 ml-64 px-10 py-10 lg:px-14 lg:py-12 min-w-0">{children}</main>
    </div>
  );
}

export const PageHeader = ({ overline, title, subtitle, action }) => (
  <div className="relative mb-10">
    <div className="flex items-end justify-between gap-6 flex-wrap">
      <div>
        {overline && (
          <div className="flex items-center gap-2 mb-2.5">
            <p className="text-[11px] uppercase tracking-[0.2em] font-semibold text-cyan-700">{overline}</p>
            <RouteRule className="w-8" />
          </div>
        )}
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-navy-950 flex items-center gap-2.5">
          {title}
          <WaveGlyph className="w-6 h-6 text-cyan-500 shrink-0 mb-0.5" />
        </h1>
        {subtitle && <p className="text-[15px] text-slate-500 mt-2.5 max-w-xl leading-relaxed">{subtitle}</p>}
      </div>
      {action}
    </div>
    <div className="mt-6 h-px bg-gradient-to-r from-navy-900/10 via-cyan-500/25 to-transparent" />
  </div>
);
