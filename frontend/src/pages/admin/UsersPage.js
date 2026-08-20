import { useEffect, useState, useCallback } from "react";
import { api, fmtDate } from "@/lib/api";
import { PageHeader } from "@/components/Layout";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Mail, Trash2, Users as UsersIcon, Pencil } from "lucide-react";

const inputCls = "w-full px-4 py-2.5 rounded-xl border border-navy-900/10 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent";
const btnPrimary = "px-5 py-2.5 rounded-full bg-navy-900 text-white text-sm font-medium hover:bg-navy-800 hover:shadow-glow-cyan-sm active:scale-[0.98] transition-[background-color,transform,box-shadow] disabled:opacity-40";
const userStatusMeta = {
  active: {
    label: "Aktif",
    className: "bg-emerald-50 text-emerald-600",
  },
  passive: {
    label: "Pasif",
    className: "bg-red-50 text-red-600",
  },
  invited: {
    label: "Davet Edildi",
    className: "bg-amber-50 text-amber-600",
  },
  pending_activation: {
    label: "Aktivasyon Gönderilmedi",
    className: "bg-slate-100 text-slate-600",
  },
};

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [tab, setTab] = useState("users");
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [userModal, setUserModal] = useState(false);
  const [groupModal, setGroupModal] = useState(null); // null | {group or new}
  const [form, setForm] = useState({ email: "", name: "", role: "employee" });
  const [userSubmitting, setUserSubmitting] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: "", member_ids: [] });
  const [statusUpdating, setStatusUpdating] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(() => {
    api.get("/users").then((r) => setUsers(r.data));
    api.get("/groups").then((r) => setGroups(r.data));
  }, []);
  useEffect(load, [load]);

  const createUser = async (sendActivation) => {
    setUserSubmitting(true);
    try {
      const response = await api.post("/users", { ...form, sendActivation });
      if (sendActivation && response.data.activation_email_sent === false) {
        toast.warning(response.data.activation_email_error || "Kullanıcı kaydedildi ancak aktivasyon maili gönderilemedi");
      } else {
        toast.success(sendActivation ? "Kullanıcı kaydedildi ve aktivasyon maili gönderildi" : "Kullanıcı kaydedildi");
      }
      setUserModal(false);
      setForm({ email: "", name: "", role: "employee" });
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Kullanıcı oluşturulamadı");
    } finally {
      setUserSubmitting(false);
    }
  };

  const toggleUserStatus = async (u, active) => {
    setStatusUpdating(u.user_id);
    try {
      await api.patch(`/users/${u.user_id}`, { active });
      toast.success(active ? "Kullanıcı aktifleştirildi" : "Kullanıcı pasife alındı");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Kullanıcı durumu güncellenemedi");
    } finally {
      setStatusUpdating(null);
    }
  };

  const deleteUser = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/users/${deleteTarget.user_id}`);
      toast.success("Kullanıcı silindi; geçmiş kayıtları korundu");
      setDeleteTarget(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Silinemedi");
    }
  };

  const resend = async (u) => {
    try {
      await api.post(`/users/${u.user_id}/resend-activation`);
      toast.success(
        u.status === "invited"
          ? "Aktivasyon maili tekrar gönderildi"
          : "Aktivasyon maili gönderildi",
      );
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Aktivasyon maili gönderilemedi");
    }
  };

  const saveGroup = async () => {
    try {
      if (groupModal?.group_id) {
        await api.put(`/groups/${groupModal.group_id}`, groupForm);
        toast.success("Grup güncellendi");
      } else {
        await api.post("/groups", groupForm);
        toast.success("Grup oluşturuldu");
      }
      setGroupModal(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Grup kaydedilemedi");
    }
  };

  const deleteGroup = async (g) => {
    if (!window.confirm(`${g.name} grubu silinsin mi?`)) return;
    await api.delete(`/groups/${g.group_id}`);
    toast.success("Grup silindi");
    load();
  };

  const toggleMember = (uid) => {
    setGroupForm((f) => ({
      ...f,
      member_ids: f.member_ids.includes(uid) ? f.member_ids.filter((x) => x !== uid) : [...f.member_ids, uid],
    }));
  };

  return (
    <div className="fade-up" data-testid="users-page">
      <PageHeader
        overline="Yönetim"
        title="Kullanıcılar & Gruplar"
        subtitle="Çalışanları tanımlayın, aktivasyon gönderin ve gruplar oluşturun."
        action={
          tab === "users" ? (
            <button data-testid="add-user-btn" className={btnPrimary} onClick={() => setUserModal(true)}>
              <span className="flex items-center gap-2"><Plus className="w-4 h-4" /> Kullanıcı Ekle</span>
            </button>
          ) : (
            <button data-testid="add-group-btn" className={btnPrimary} onClick={() => { setGroupForm({ name: "", member_ids: [] }); setGroupModal({}); }}>
              <span className="flex items-center gap-2"><Plus className="w-4 h-4" /> Grup Oluştur</span>
            </button>
          )
        }
      />
      <div className="flex gap-1 bg-slate-100 rounded-full p-1 w-fit mb-8">
        {[["users", "Kullanıcılar"], ["groups", "Gruplar"]].map(([k, l]) => (
          <button
            key={k}
            data-testid={`tab-${k}`}
            onClick={() => setTab(k)}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-colors ${tab === k ? "bg-white shadow-sm text-navy-950" : "text-slate-500"}`}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === "users" && (
        <div className="n-card n-card-brand overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b n-hairline bg-[#F5F8FA]">
                <th className="px-6 py-4 font-medium">Kullanıcı</th>
                <th className="px-6 py-4 font-medium">Rol</th>
                <th className="px-6 py-4 font-medium">Durum</th>
                <th className="px-6 py-4 font-medium">Kayıt</th>
                <th className="px-6 py-4 font-medium text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.user_id} className="border-b border-navy-900/5 last:border-0 hover:bg-slate-50/60" data-testid={`user-row-${u.email}`}>
                  <td className="px-6 py-4">
                    <p className="font-medium text-navy-950">{u.name}</p>
                    <p className="text-slate-400 text-xs">{u.email}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${u.role === "admin" ? "bg-gradient-to-r from-navy-900 to-navy-700 text-white" : "bg-slate-100 text-slate-600"}`}>
                      {u.role === "admin" ? "Yönetici" : "Çalışan"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${userStatusMeta[u.status]?.className || userStatusMeta.pending_activation.className}`}>
                      {userStatusMeta[u.status]?.label || userStatusMeta.pending_activation.label}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-400">{fmtDate(u.created_at)}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      {u.can_manage_status && (
                        <label className="flex items-center gap-2 mr-1 text-xs text-slate-500">
                          <Switch
                            data-testid={`toggle-user-${u.email}`}
                            checked={u.account_active}
                            disabled={
                              statusUpdating === u.user_id ||
                              currentUser?.user_id === u.user_id
                            }
                            onCheckedChange={(active) => toggleUserStatus(u, active)}
                            aria-label={`${u.name} kullanıcısını ${u.account_active ? "pasife al" : "aktifleştir"}`}
                          />
                          <span>{u.account_active ? "Aktif" : "Pasif"}</span>
                        </label>
                      )}
                      {(u.status === "invited" || u.status === "pending_activation") && (
                        <button data-testid={`resend-activation-${u.email}`} onClick={() => resend(u)} title={u.status === "invited" ? "Aktivasyonu tekrar gönder" : "Aktivasyon gönder"}
                          className="p-2 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-colors">
                          <Mail className="w-4 h-4" />
                        </button>
                      )}
                      {currentUser?.user_id !== u.user_id && (
                        <button data-testid={`delete-user-${u.email}`} onClick={() => setDeleteTarget(u)} title="Sil"
                          className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "groups" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groups.length === 0 && <p className="text-sm text-slate-400 col-span-full">Henüz grup yok.</p>}
          {groups.map((g) => (
            <div key={g.group_id} className="n-card n-card-hover p-6" data-testid={`group-card-${g.name}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="w-10 h-10 rounded-xl bg-navy-50 text-navy-700 flex items-center justify-center">
                  <UsersIcon className="w-5 h-5" />
                </div>
                <div className="flex gap-1">
                  <button data-testid={`edit-group-${g.name}`} onClick={() => { setGroupForm({ name: g.name, member_ids: g.member_ids || [] }); setGroupModal(g); }}
                    className="p-2 rounded-lg text-slate-400 hover:text-navy-950 hover:bg-slate-100 transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button data-testid={`delete-group-${g.name}`} onClick={() => deleteGroup(g)}
                    className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="font-medium text-navy-950">{g.name}</p>
              <p className="text-sm text-slate-400 mt-1">{(g.member_ids || []).length} üye</p>
            </div>
          ))}
        </div>
      )}

      <Dialog open={userModal} onOpenChange={setUserModal}>
        <DialogContent className="rounded-2xl">
          <DialogHeader><DialogTitle>Yeni Kullanıcı</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <input data-testid="user-name-input" className={inputCls} placeholder="Ad Soyad" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input data-testid="user-email-input" type="email" className={inputCls} placeholder="E-posta" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <select data-testid="user-role-select" className={inputCls} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="employee">Çalışan</option>
              <option value="admin">Yönetici</option>
            </select>
            <div className="space-y-2 pt-1">
              <button
                data-testid="user-save-btn"
                className="w-full px-5 py-2.5 rounded-full bg-white border border-navy-900/15 text-navy-900 text-sm font-medium hover:bg-slate-50 active:scale-[0.98] transition-[background-color,transform] disabled:opacity-40"
                disabled={!form.email || !form.name || userSubmitting}
                onClick={() => createUser(false)}
              >
                {userSubmitting ? "Kaydediliyor..." : "Kullanıcıyı Kaydet"}
              </button>
              <button
                data-testid="user-save-and-send-activation-btn"
                className={btnPrimary + " w-full"}
                disabled={!form.email || !form.name || userSubmitting}
                onClick={() => createUser(true)}
              >
                {userSubmitting ? "Gönderiliyor..." : "Kaydet ve Aktivasyon Maili Gönder"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kullanıcı silinsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.name}</strong> kullanıcı listesinden kaldırılacak ve
              artık giriş yapamayacak. Eğitim ilerlemesi, sınav sonuçları, izleme
              geçmişi ve kullanıcı bilgileri raporlar için korunacak.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-delete-user"
              onClick={deleteUser}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Kullanıcıyı Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!groupModal} onOpenChange={(o) => !o && setGroupModal(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader><DialogTitle>{groupModal?.group_id ? "Grubu Düzenle" : "Yeni Grup"}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <input data-testid="group-name-input" className={inputCls} placeholder="Grup adı" value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} />
            <div className="max-h-56 overflow-y-auto border border-navy-900/5 rounded-xl divide-y divide-navy-900/5">
              {users.filter((u) => u.role === "employee" && u.status === "active").map((u) => (
                <label key={u.user_id} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50">
                  <input type="checkbox" data-testid={`group-member-${u.email}`} checked={groupForm.member_ids.includes(u.user_id)} onChange={() => toggleMember(u.user_id)} className="accent-navy-900" />
                  <span className="text-sm text-slate-700">{u.name}</span>
                  <span className="text-xs text-slate-400 ml-auto">{u.email}</span>
                </label>
              ))}
            </div>
            <button data-testid="group-save-btn" className={btnPrimary + " w-full"} disabled={!groupForm.name} onClick={saveGroup}>Kaydet</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
