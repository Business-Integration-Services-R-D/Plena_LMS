import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutDashboard, Users, HelpCircle, Clapperboard, Send, BarChart3, Mail, GraduationCap, LogOut, BookOpen,
} from "lucide-react";

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

const NavItem = ({ item }) => (
  <NavLink
    to={item.to}
    end={item.end}
    data-testid={`nav-${item.to.replace(/\//g, "-").slice(1)}`}
    className={({ isActive }) =>
      `flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[13px] font-medium transition-colors ${
        isActive ? "bg-black/[0.06] text-gray-900" : "text-gray-500 hover:bg-black/[0.04] hover:text-gray-800"
      }`
    }
  >
    <item.icon className="w-4 h-4 shrink-0" strokeWidth={1.8} />
    {item.label}
  </NavLink>
);

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";

  return (
    <div className="min-h-screen bg-[#FAFAF9] flex">
      <aside className="w-60 shrink-0 border-r n-hairline bg-[#F7F7F5] flex flex-col fixed inset-y-0 z-20">
        <button
          data-testid="sidebar-logo"
          onClick={() => navigate(isAdmin ? "/admin" : "/trainings")}
          className="flex items-center gap-2.5 px-4 h-14"
        >
          <div className="w-7 h-7 rounded-lg bg-gray-900 flex items-center justify-center shadow-[0_2px_6px_rgba(0,0,0,0.25)]">
            <GraduationCap className="w-4 h-4 text-white" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-gray-900">Plena LMS</span>
        </button>
        <nav className="flex-1 px-2.5 pt-2 space-y-6 overflow-y-auto">
          {isAdmin ? (
            <>
              <div className="space-y-0.5">
                <p className="px-2.5 pb-1.5 text-[10px] uppercase tracking-[0.14em] font-semibold text-gray-400">Çalışma Alanı</p>
                {adminNav.map((item) => <NavItem key={item.to} item={item} />)}
              </div>
              <div className="space-y-0.5">
                <p className="px-2.5 pb-1.5 text-[10px] uppercase tracking-[0.14em] font-semibold text-gray-400">Analiz</p>
                {adminNav2.map((item) => <NavItem key={item.to} item={item} />)}
              </div>
            </>
          ) : (
            <div className="space-y-0.5">
              <p className="px-2.5 pb-1.5 text-[10px] uppercase tracking-[0.14em] font-semibold text-gray-400">Eğitim</p>
              {employeeNav.map((item) => <NavItem key={item.to} item={item} />)}
            </div>
          )}
        </nav>
        <div className="p-2.5">
          <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-white border n-hairline shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            {user?.picture ? (
              <img src={user.picture} alt={user.name} className="w-7 h-7 rounded-full object-cover" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-[11px] font-semibold text-gray-600">
                {user?.name?.[0]?.toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[12.5px] font-medium text-gray-900 truncate leading-tight" data-testid="sidebar-user-name">{user?.name}</p>
              <p className="text-[10.5px] text-gray-400 truncate">{user?.role === "admin" ? "Yönetici" : "Çalışan"}</p>
            </div>
            <button
              data-testid="logout-btn"
              onClick={logout}
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-900 hover:bg-black/[0.05] transition-colors"
              title="Çıkış Yap"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>
      <main className="flex-1 ml-60 px-10 py-10 lg:px-14 lg:py-12 min-w-0">{children}</main>
    </div>
  );
}

export const PageHeader = ({ overline, title, subtitle, action }) => (
  <div className="flex items-end justify-between mb-10 gap-6 flex-wrap">
    <div>
      {overline && <p className="text-[11px] uppercase tracking-[0.2em] font-semibold text-gray-400 mb-2.5">{overline}</p>}
      <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-gray-900">{title}</h1>
      {subtitle && <p className="text-[15px] text-gray-500 mt-2.5 max-w-xl leading-relaxed">{subtitle}</p>}
    </div>
    {action}
  </div>
);
