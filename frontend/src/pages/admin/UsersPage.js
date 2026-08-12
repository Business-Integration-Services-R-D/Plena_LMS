import { useEffect, useState, useCallback } from "react";
import { api, fmtDate } from "@/lib/api";
import { PageHeader } from "@/components/Layout";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Mail, Trash2, Users as UsersIcon, Pencil } from "lucide-react";

const inputCls = "w-full px-4 py-2.5 rounded-xl border border-black/10 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF] focus:border-transparent";
const btnPrimary = "px-5 py-2.5 rounded-full bg-black text-white text-sm font-medium hover:bg-gray-800 active:scale-[0.98] transition-[background-color,transform] disabled:opacity-40";

export default function UsersPage() {
  const [tab, setTab] = useState("users");
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [userModal, setUserModal] = useState(false);
  const [groupModal, setGroupModal] = useState(null); // null | {group or new}
  const [form, setForm] = useState({ email: "", name: "", role: "employee" });
  const [groupForm, setGroupForm] = useState({ name: "", member_ids: [] });

  const load = useCallback(() => {
    api.get("/users").then((r) => setUsers(r.data));
    api.get("/groups").then((r) => setGroups(r.data));
  }, []);
  useEffect(load, [load]);

  const createUser = async () => {
    try {
      await api.post("/users", form);
      toast.success("Kullanıcı oluşturuldu, aktivasyon maili gönderildi (mock)");
      setUserModal(false);
      setForm({ email: "", name: "", role: "employee" });
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Kullanıcı oluşturulamadı");
    }
  };

  const deleteUser = async (u) => {
    if (!window.confirm(`${u.name} silinsin mi?`)) return;
    try {
      await api.delete(`/users/${u.user_id}`);
      toast.success("Kullanıcı silindi");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Silinemedi");
    }
  };

  const resend = async (u) => {
    await api.post(`/users/${u.user_id}/resend-activation`);
    toast.success("Aktivasyon maili tekrar gönderildi (mock)");
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
      <div className="flex gap-1 bg-gray-100 rounded-full p-1 w-fit mb-8">
        {[["users", "Kullanıcılar"], ["groups", "Gruplar"]].map(([k, l]) => (
          <button
            key={k}
            data-testid={`tab-${k}`}
            onClick={() => setTab(k)}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-colors ${tab === k ? "bg-white shadow-sm text-gray-900" : "text-gray-500"}`}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === "users" && (
        <div className="n-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b n-hairline bg-[#FAFAF9]">
                <th className="px-6 py-4 font-medium">Kullanıcı</th>
                <th className="px-6 py-4 font-medium">Rol</th>
                <th className="px-6 py-4 font-medium">Durum</th>
                <th className="px-6 py-4 font-medium">Kayıt</th>
                <th className="px-6 py-4 font-medium text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.user_id} className="border-b border-black/5 last:border-0 hover:bg-gray-50/50" data-testid={`user-row-${u.email}`}>
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-900">{u.name}</p>
                    <p className="text-gray-400 text-xs">{u.email}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${u.role === "admin" ? "bg-black text-white" : "bg-gray-100 text-gray-600"}`}>
                      {u.role === "admin" ? "Yönetici" : "Çalışan"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${u.status === "active" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
                      {u.status === "active" ? "Aktif" : "Davet Edildi"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-400">{fmtDate(u.created_at)}</td>
                  <td className="px-6 py-4">
                    <div className="flex justify-end gap-1">
                      {u.status !== "active" && (
                        <button data-testid={`resend-activation-${u.email}`} onClick={() => resend(u)} title="Aktivasyonu tekrar gönder"
                          className="p-2 rounded-lg text-gray-400 hover:text-[#007AFF] hover:bg-blue-50 transition-colors">
                          <Mail className="w-4 h-4" />
                        </button>
                      )}
                      <button data-testid={`delete-user-${u.email}`} onClick={() => deleteUser(u)} title="Sil"
                        className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
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
          {groups.length === 0 && <p className="text-sm text-gray-400 col-span-full">Henüz grup yok.</p>}
          {groups.map((g) => (
            <div key={g.group_id} className="n-card n-card-hover p-6" data-testid={`group-card-${g.name}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <UsersIcon className="w-5 h-5" />
                </div>
                <div className="flex gap-1">
                  <button data-testid={`edit-group-${g.name}`} onClick={() => { setGroupForm({ name: g.name, member_ids: g.member_ids || [] }); setGroupModal(g); }}
                    className="p-2 rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button data-testid={`delete-group-${g.name}`} onClick={() => deleteGroup(g)}
                    className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="font-medium text-gray-900">{g.name}</p>
              <p className="text-sm text-gray-400 mt-1">{(g.member_ids || []).length} üye</p>
            </div>
          ))}
        </div>
      )}

      <Dialog open={userModal} onOpenChange={setUserModal}>
        <DialogContent className="rounded-2xl">
          <DialogHeader><DialogTitle>Yeni Kullanıcı</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <input data-testid="user-name-input" className={inputCls} placeholder="Ad Soyad" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input data-testid="user-email-input" className={inputCls} placeholder="E-posta (Google hesabı)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <select data-testid="user-role-select" className={inputCls} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="employee">Çalışan</option>
              <option value="admin">Yönetici</option>
            </select>
            <button data-testid="user-save-btn" className={btnPrimary + " w-full"} disabled={!form.email || !form.name} onClick={createUser}>
              Oluştur & Aktivasyon Gönder
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!groupModal} onOpenChange={(o) => !o && setGroupModal(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader><DialogTitle>{groupModal?.group_id ? "Grubu Düzenle" : "Yeni Grup"}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <input data-testid="group-name-input" className={inputCls} placeholder="Grup adı" value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} />
            <div className="max-h-56 overflow-y-auto border border-black/5 rounded-xl divide-y divide-black/5">
              {users.filter((u) => u.role === "employee").map((u) => (
                <label key={u.user_id} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50">
                  <input type="checkbox" data-testid={`group-member-${u.email}`} checked={groupForm.member_ids.includes(u.user_id)} onChange={() => toggleMember(u.user_id)} className="accent-black" />
                  <span className="text-sm text-gray-800">{u.name}</span>
                  <span className="text-xs text-gray-400 ml-auto">{u.email}</span>
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
