import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import AuthCallback from "@/pages/AuthCallback";
import ActivatePage from "@/pages/ActivatePage";
import LoginPage from "@/pages/LoginPage";
import ForgotPasswordPage from "@/pages/ForgotPasswordPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import SettingsPage from "@/pages/SettingsPage";
import Layout from "@/components/Layout";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import UsersPage from "@/pages/admin/UsersPage";
import QuestionsPage from "@/pages/admin/QuestionsPage";
import TrainingsPage from "@/pages/admin/TrainingsPage";
import TrainingDetailPage from "@/pages/admin/TrainingDetailPage";
import AssignmentsPage from "@/pages/admin/AssignmentsPage";
import ReportsPage from "@/pages/admin/ReportsPage";
import NotificationsPage from "@/pages/admin/NotificationsPage";
import MyTrainingsPage from "@/pages/employee/MyTrainingsPage";
import WatchPage from "@/pages/employee/WatchPage";

const Protected = ({ children, adminOnly }) => {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAF9]">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-black rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== "admin") return <Navigate to="/trainings" replace />;
  return <Layout>{children}</Layout>;
};

const HomeRedirect = () => {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAF9]">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-black rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "admin" ? "/admin" : "/trainings"} replace />;
};

function AppRouter() {
  const location = useLocation();
  const authBypass = process.env.REACT_APP_AUTH_BYPASS === "true";
  // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
  if (location.hash?.includes("session_id=")) return <AuthCallback />;
  return (
    <Routes>
      <Route path="/login" element={authBypass ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/activate" element={<ActivatePage />} />
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/dashboard" element={<HomeRedirect />} />
      <Route path="/admin" element={<Protected adminOnly><AdminDashboard /></Protected>} />
      <Route path="/admin/users" element={<Protected adminOnly><UsersPage /></Protected>} />
      <Route path="/admin/questions" element={<Protected adminOnly><QuestionsPage /></Protected>} />
      <Route path="/admin/trainings" element={<Protected adminOnly><TrainingsPage /></Protected>} />
      <Route path="/admin/trainings/:trainingId" element={<Protected adminOnly><TrainingDetailPage /></Protected>} />
      <Route path="/admin/assignments" element={<Protected adminOnly><AssignmentsPage /></Protected>} />
      <Route path="/admin/reports" element={<Protected adminOnly><ReportsPage /></Protected>} />
      <Route path="/admin/notifications" element={<Protected adminOnly><NotificationsPage /></Protected>} />
      <Route path="/trainings" element={<Protected><MyTrainingsPage /></Protected>} />
      <Route path="/trainings/:assignmentId/watch" element={<Protected><WatchPage /></Protected>} />
      <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRouter />
        <Toaster position="top-right" richColors />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
