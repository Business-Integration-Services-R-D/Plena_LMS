import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import {
  LayoutDashboard, Users, HelpCircle, Clapperboard, Send, BarChart3, LogOut, BookOpen, Menu, X, Bell,
  Settings,
} from "lucide-react";
import { BrandLockup } from "@/components/brand/MartiMark";
import { WaveLine, RouteRule, WaveGlyph, MapDots } from "@/components/brand/Decoration";

const adminNav = [
  { to: "/admin", label: "Genel Bakış", icon: LayoutDashboard, end: true },
  { to: "/admin/users", label: "Kullanıcılar & Gruplar", icon: Users },
  { to: "/admin/questions", label: "Soru Havuzu", icon: HelpCircle },
  { to: "/admin/trainings", label: "Eğitimler", icon: Clapperboard },
  { to: "/admin/assignments", label: "Atamalar", icon: Send },
];

const adminNav2 = [{ to: "/admin/reports", label: "Raporlar", icon: BarChart3 }];

const employeeNav = [{ to: "/trainings", label: "Eğitimlerim", icon: BookOpen }];
const accountNav = [{ to: "/settings", label: "Profil Ayarları", icon: Settings }];

const relativeTime = (iso) => {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "Şimdi";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Dün" : `${days} gün önce`;
};

// Kullanıcıya özel kalıcı bildirimlerin hızlı önizlemesi.
const NotificationBell = ({ variant = "desktop" }) => {
  const navigate = useNavigate();
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = useCallback(() => {
    api.get("/notifications")
      .then((response) => {
        setItems(response.data.items);
        setUnreadCount(response.data.unread_count);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadNotifications();
    const timer = window.setInterval(loadNotifications, 60_000);
    return () => window.clearInterval(timer);
  }, [loadNotifications]);

  useEffect(() => {
    if (!open) return undefined;
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const recent = items.slice(0, 5);
  const isMobile = variant === "mobile";

  const toggleDropdown = () => {
    setOpen((current) => {
      if (!current) loadNotifications();
      return !current;
    });
  };

  const goToItem = async (item) => {
    if (!item.read) {
      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, read: true } : entry,
        ),
      );
      setUnreadCount((current) => Math.max(0, current - 1));
      api.patch(`/notifications/${item.id}/read`).catch(loadNotifications);
    }
    setOpen(false);
    navigate(item.link || "/trainings");
  };

  const markAllRead = async () => {
    setItems((current) => current.map((item) => ({ ...item, read: true })));
    setUnreadCount(0);
    try {
      await api.post("/notifications/read-all");
    } catch {
      loadNotifications();
    }
  };

  return (
    <div ref={ref} className={`relative z-50 ${isMobile ? "" : "translate-x-10 translate-y-2"}`}>
      <button
        data-testid={`notification-bell-${variant}`}
        onClick={toggleDropdown}
        aria-label="Bildirimler"
        className={
          isMobile
            ? "relative translate-y-1 p-2 rounded-lg text-white hover:bg-white/[0.08] transition-colors"
            : "relative w-10 h-10 rounded-full bg-white shadow-[0_8px_24px_-10px_rgba(14,32,51,0.35)] border border-navy-900/[0.06] flex items-center justify-center text-navy-700 hover:text-brand-600 transition-colors"
        }
      >
        <Bell className="w-5 h-5" strokeWidth={1.8} />
        {unreadCount > 0 && (
          <span data-testid="notification-unread-badge" className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-cyan-500 text-white text-[10px] font-semibold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div
          className={`absolute ${isMobile ? "right-0 top-11" : "right-0 top-12"} w-[26rem] max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-[0_24px_60px_-20px_rgba(14,32,51,0.35)] border border-navy-900/[0.06] overflow-hidden z-40`}
          data-testid="notification-dropdown"
        >
          <div className="flex items-center justify-between gap-4 px-5 py-4 border-b n-hairline">
            <div>
              <p className="text-base font-semibold text-navy-950">Bildirimler</p>
              <p className="text-xs text-slate-400 mt-0.5">{unreadCount > 0 ? `${unreadCount} okunmamış bildirim` : "Tüm bildirimler okundu"}</p>
            </div>
            {unreadCount > 0 && (
              <button data-testid="notification-mark-all-read" onClick={markAllRead} className="text-xs text-brand-600 font-medium hover:underline shrink-0">
                Tümünü okundu yap
              </button>
            )}
          </div>
          <div className="max-h-[28rem] overflow-y-auto divide-y divide-navy-900/5">
            {recent.length === 0 && <p className="px-5 py-10 text-sm text-slate-400 text-center">Henüz bildirim yok.</p>}
            {recent.map((item) => (
              <button
                key={item.id}
                data-testid={`notification-item-${item.id}`}
                onClick={() => goToItem(item)}
                className={`w-full text-left px-5 py-4 hover:bg-slate-50 transition-colors ${item.read ? "bg-white" : "bg-brand-50/50"}`}
              >
                <div className="flex items-start justify-between gap-4 mb-1.5">
                  <p className={`text-sm leading-snug ${item.read ? "font-medium text-slate-600" : "font-semibold text-brand-700"}`}>{item.title}</p>
                  <p className="text-xs text-slate-400 shrink-0 pt-0.5">{relativeTime(item.occurred_at)}</p>
                </div>
                <div className="flex items-start gap-2.5">
                  {!item.read && <span className="w-2 h-2 rounded-full bg-cyan-500 shrink-0 mt-1.5" aria-label="Okunmamış" />}
                  <p className={`text-sm leading-relaxed text-navy-950 line-clamp-3 ${item.read ? "font-normal" : "font-medium"}`}>{item.text}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Vertical "route line" running behind the nav icon column — a wayfinding
// motif (course markers) rather than a literal logistics illustration.
const NavGroup = ({ label, items, onNavigate }) => (
  <div className="space-y-0.5">
    <p className="px-2.5 pb-1.5 text-[10px] uppercase tracking-[0.14em] font-semibold text-navy-400">{label}</p>
    <div className="relative">
      <div className="absolute left-[19px] top-1 bottom-1 w-px bg-gradient-to-b from-cyan-500/25 via-white/[0.07] to-transparent" aria-hidden="true" />
      <div className="space-y-0.5">
        {items.map((item) => <NavItem key={item.to} item={item} onNavigate={onNavigate} />)}
      </div>
    </div>
  </div>
);

const NavItem = ({ item, onNavigate }) => (
  <NavLink
    to={item.to}
    end={item.end}
    onClick={onNavigate}
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = () => setMobileOpen(false);

  return (
    <div className="min-h-screen bg-[#F4F7FA] flex">
      {/* Mobile top bar */}
      <header className="lg:hidden fixed top-0 inset-x-0 z-20 flex items-center gap-3 px-4 h-14 bg-navy-950/95 backdrop-blur-sm border-b border-white/[0.06]">
        <button
          data-testid="mobile-menu-toggle"
          onClick={() => setMobileOpen(true)}
          aria-label="Menüyü aç"
          className="p-2 -ml-2 rounded-lg text-white hover:bg-white/[0.08] transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <BrandLockup compact onClick={() => navigate(isAdmin ? "/admin" : "/trainings")} />
        </div>
        <NotificationBell variant="mobile" isAdmin={isAdmin} />
      </header>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-navy-950/60 backdrop-blur-[1px]"
          onClick={closeMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={`w-72 sm:w-64 max-w-[85vw] shrink-0 bg-gradient-to-b from-navy-950 via-navy-950 to-[#081826] flex flex-col fixed inset-y-0 left-0 z-40 overflow-hidden transition-transform duration-300 ease-out ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
      >
        {/* Ambient brand glow + wave/route rhythm — atmospheric only, no literal iconography */}
        <div className="absolute -top-24 -right-20 w-56 h-56 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" aria-hidden="true" />
        <MapDots className="absolute top-16 right-0 w-24 h-16 text-white/[0.05] pointer-events-none" />
        <div className="absolute bottom-0 inset-x-0 h-40 pointer-events-none opacity-[0.07] text-cyan-300" aria-hidden="true">
          <WaveLine className="w-full h-8 absolute bottom-24" />
          <WaveLine className="w-full h-8 absolute bottom-14" />
          <WaveLine className="w-full h-8 absolute bottom-4" />
        </div>

        <div className="relative z-10 flex flex-col h-full">
          <div className="flex items-center">
            <div className="flex-1 min-w-0">
              <BrandLockup onClick={() => { navigate(isAdmin ? "/admin" : "/trainings"); closeMobile(); }} />
            </div>
            <button
              data-testid="mobile-menu-close"
              onClick={closeMobile}
              aria-label="Menüyü kapat"
              className="lg:hidden p-2 mr-3 rounded-lg text-navy-300 hover:text-white hover:bg-white/[0.08] transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-4 pb-3 mb-2">
            <div className="h-px bg-gradient-to-r from-cyan-500/40 via-white/10 to-transparent" />
          </div>

          <nav className="flex-1 px-2.5 space-y-6 overflow-y-auto">
            {isAdmin ? (
              <>
                <NavGroup label="Çalışma Alanı" items={adminNav} onNavigate={closeMobile} />
                <NavGroup label="Analiz" items={adminNav2} onNavigate={closeMobile} />
              </>
            ) : (
              <NavGroup label="Eğitim" items={employeeNav} onNavigate={closeMobile} />
            )}
            <NavGroup label="Hesabım" items={accountNav} onNavigate={closeMobile} />
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
              <button type="button" onClick={() => { navigate("/settings"); closeMobile(); }} className="flex-1 min-w-0 text-left" title="Profil ayarlarını aç">
                <p className="text-[12.5px] font-medium text-white truncate leading-tight" data-testid="sidebar-user-name">{user?.name}</p>
                <p className="text-[10.5px] text-navy-400 truncate">{user?.role === "admin" ? "Yönetici" : "Çalışan"}</p>
              </button>
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
      <main className="flex-1 lg:ml-64 pt-14 lg:pt-0 px-4 py-6 sm:px-6 sm:py-8 lg:px-14 lg:py-12 min-w-0 w-full">
        <div className="hidden lg:flex justify-end mb-4">
          <NotificationBell variant="desktop" isAdmin={isAdmin} />
        </div>
        {children}
      </main>
    </div>
  );
}

export const PageHeader = ({ overline, title, subtitle, action }) => (
  <div className="relative mb-8 sm:mb-10">
    <div className="flex items-end justify-between gap-4 sm:gap-6 flex-wrap">
      <div className="min-w-0">
        {overline && (
          <div className="flex items-center gap-2 mb-2.5">
            <p className="text-[11px] uppercase tracking-[0.2em] font-semibold text-cyan-700">{overline}</p>
            <RouteRule className="w-8" />
          </div>
        )}
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight text-navy-950 flex items-center gap-2.5">
          {title}
          <WaveGlyph className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-500 shrink-0 mb-0.5" />
        </h1>
        {subtitle && <p className="text-sm sm:text-[15px] text-slate-500 mt-2.5 max-w-xl leading-relaxed">{subtitle}</p>}
      </div>
      {action && <div className="w-full sm:w-auto">{action}</div>}
    </div>
    <div className="relative mt-6 h-px overflow-visible">
      <div className="absolute inset-0 bg-gradient-to-r from-navy-900/10 via-cyan-500/20 to-transparent" />
      <WaveLine className="absolute -top-[7px] left-0 w-full h-3.5 text-cyan-500/25" />
    </div>
  </div>
);
