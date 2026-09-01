import { useEffect, useState, useCallback } from "react";
import { api, fmtDate, STATUS_TR, STATUS_COLOR } from "@/lib/api";
import { PageHeader } from "@/components/Layout";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Info, Plus, Trash2 } from "lucide-react";

const inputCls = "w-full px-4 py-2.5 rounded-xl border border-navy-900/10 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent";
const btnPrimary = "px-5 py-2.5 rounded-full bg-navy-900 text-white text-sm font-medium hover:bg-navy-800 hover:shadow-glow-cyan-sm active:scale-[0.98] transition-[background-color,transform,box-shadow] disabled:opacity-40";
const MAX_ASSIGNMENT_DATE_TIME = "9999-12-31T23:59";

const toLocalMinute = (date = new Date()) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

const addLocalMinute = (value) => {
  const date = value ? new Date(value) : new Date();
  date.setSeconds(0, 0);
  date.setMinutes(date.getMinutes() + 1);
  return toLocalMinute(date);
};

const hasFourDigitYear = (value) => !value || /^\d{4}-/.test(value);

export default function AssignmentsPage() {
  const [assignments, setAssignments] = useState([]);
  const [trainings, setTrainings] = useState([]);
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ training_id: "", user_ids: [], group_ids: [], start_at: "", due_at: "", reminder_days: 0 });
  const [minimumDateTime, setMinimumDateTime] = useState(toLocalMinute);
  const [startDateFeedback, setStartDateFeedback] = useState("");
  const [dueDateFeedback, setDueDateFeedback] = useState("");

  const load = useCallback(() => {
    api.get("/assignments").then((r) => setAssignments(r.data));
    api.get("/trainings").then((r) => setTrainings(r.data));
    api.get("/users").then((r) => setUsers(r.data));
    api.get("/groups").then((r) => setGroups(r.data));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!modal) return undefined;
    const refreshMinimum = () => setMinimumDateTime(toLocalMinute());
    refreshMinimum();
    const timer = window.setInterval(refreshMinimum, 30_000);
    return () => window.clearInterval(timer);
  }, [modal]);

  const toggle = (key, id) => setForm((f) => ({ ...f, [key]: f[key].includes(id) ? f[key].filter((x) => x !== id) : [...f[key], id] }));

  const changeStartAt = (value) => {
    const currentMinimum = toLocalMinute();
    setMinimumDateTime(currentMinimum);
    if (!hasFourDigitYear(value)) {
      setStartDateFeedback("Yıl en fazla 4 basamaklı olabilir.");
      return;
    }
    if (value && value < currentMinimum) {
      setStartDateFeedback("Geçmiş bir başlangıç tarihi seçilemez.");
      return;
    }
    setStartDateFeedback("");
    setDueDateFeedback("");
    setForm((current) => ({
      ...current,
      start_at: value,
      ...(current.due_at && current.due_at < addLocalMinute(value || currentMinimum)
        ? { due_at: "", reminder_days: 0 }
        : {}),
    }));
  };

  const changeDueAt = (value) => {
    const currentMinimum = toLocalMinute();
    const earliestDueAt = addLocalMinute(form.start_at || currentMinimum);
    setMinimumDateTime(currentMinimum);
    if (!hasFourDigitYear(value)) {
      setDueDateFeedback("Yıl en fazla 4 basamaklı olabilir.");
      return;
    }
    if (value && value < earliestDueAt) {
      setDueDateFeedback(
        form.start_at
          ? "Son tarih başlangıç tarihinden sonra olmalı."
          : "Geçmiş bir son tarih seçilemez.",
      );
      return;
    }
    setDueDateFeedback("");
    setForm((current) => ({
      ...current,
      due_at: value,
      ...(!value ? { reminder_days: 0 } : {}),
    }));
  };

  const create = async () => {
    const currentMinimum = toLocalMinute();
    if (form.start_at && (!hasFourDigitYear(form.start_at) || form.start_at < currentMinimum)) {
      toast.error("Başlangıç tarihi geçmişte olamaz ve yıl 4 basamaklı olmalıdır");
      return;
    }
    if (
      form.due_at &&
      (!hasFourDigitYear(form.due_at) || form.due_at < addLocalMinute(form.start_at || currentMinimum))
    ) {
      toast.error("Son tarih gelecekte ve başlangıç tarihinden sonra olmalıdır");
      return;
    }
    try {
      const payload = {
        ...form,
        start_at: form.start_at ? new Date(form.start_at).toISOString() : null,
        due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
        reminder_days: Number(form.reminder_days) || 0,
      };
      const res = await api.post("/assignments", payload);
      toast.success(`${res.data.created} atama oluşturuldu. Uygulama içi bildirimler planlandı`);
      setModal(false);
      setForm({ training_id: "", user_ids: [], group_ids: [], start_at: "", due_at: "", reminder_days: 0 });
      setStartDateFeedback("");
      setDueDateFeedback("");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Atama oluşturulamadı");
    }
  };

  const remove = async (a) => {
    if (!window.confirm("Bu atama ve ilerleme kaydı silinsin mi?")) return;
    await api.delete(`/assignments/${a.assignment_id}`);
    toast.success("Atama silindi");
    load();
  };

  return (
    <div className="fade-up" data-testid="assignments-page">
      <PageHeader
        overline="Operasyon"
        title="Atamalar"
        subtitle="Eğitimleri kullanıcı veya gruplara atayın, ileri tarih ve hatırlatma belirleyin."
        action={
          <button data-testid="add-assignment-btn" className={btnPrimary} onClick={() => setModal(true)}>
            <span className="flex items-center gap-2"><Plus className="w-4 h-4" /> Yeni Atama</span>
          </button>
        }
      />
      <div className="n-card n-card-brand overflow-x-auto">
        <table className="w-full text-sm min-w-[860px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b n-hairline bg-[#F5F8FA]">
              <th className="px-6 py-4 font-medium">Kullanıcı</th>
              <th className="px-6 py-4 font-medium">Eğitim</th>
              <th className="px-6 py-4 font-medium">Durum</th>
              <th className="px-6 py-4 font-medium">Başlangıç</th>
              <th className="px-6 py-4 font-medium">Son Tarih</th>
              <th className="px-6 py-4 font-medium">Hatırlatma</th>
              <th className="px-6 py-4 font-medium text-right"></th>
            </tr>
          </thead>
          <tbody>
            {assignments.length === 0 && (
              <tr><td colSpan="7" className="px-6 py-10 text-center text-slate-400">Henüz atama yok.</td></tr>
            )}
            {assignments.map((a) => (
              <tr key={a.assignment_id} className="border-b border-navy-900/5 last:border-0 hover:bg-slate-50/60" data-testid={`assignment-row-${a.assignment_id}`}>
                <td className="px-6 py-4">
                  <p className="font-medium text-navy-950">{a.user_name}</p>
                  <p className="text-xs text-slate-400">{a.user_email}</p>
                </td>
                <td className="px-6 py-4 text-slate-700">{a.training_title}</td>
                <td className="px-6 py-4">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLOR[a.status]}`}>{STATUS_TR[a.status]}</span>
                </td>
                <td className="px-6 py-4 text-slate-400">{fmtDate(a.start_at)}</td>
                <td className="px-6 py-4 text-slate-400">{fmtDate(a.due_at)}</td>
                <td className="px-6 py-4 text-slate-400">{a.reminder_days ? `Son ${a.reminder_days} gün, günlük` : "-"}</td>
                <td className="px-6 py-4 text-right">
                  <button data-testid={`delete-assignment-${a.assignment_id}`} onClick={() => remove(a)} className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog
        open={modal}
        onOpenChange={(open) => {
          setModal(open);
          if (!open) {
            setStartDateFeedback("");
            setDueDateFeedback("");
          }
        }}
      >
        <DialogContent className="rounded-2xl max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Yeni Atama</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <select data-testid="assignment-training-select" className={inputCls} value={form.training_id} onChange={(e) => setForm({ ...form, training_id: e.target.value })}>
              <option value="">Eğitim seçin...</option>
              {trainings.filter((t) => t.video_filename).map((t) => <option key={t.training_id} value={t.training_id}>{t.title}</option>)}
            </select>
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-2">Kullanıcılar</p>
              <div className="max-h-40 overflow-y-auto border border-navy-900/5 rounded-xl divide-y divide-navy-900/5">
                {users.filter((u) => u.role === "employee" && u.account_active).map((u) => (
                  <label key={u.user_id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50">
                    <input type="checkbox" data-testid={`assign-user-${u.email}`} checked={form.user_ids.includes(u.user_id)} onChange={() => toggle("user_ids", u.user_id)} className="accent-navy-900" />
                    <span className="text-sm text-slate-700">{u.name}</span>
                    <span className="text-xs text-slate-400 ml-auto">{u.email}</span>
                  </label>
                ))}
              </div>
            </div>
            {groups.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400 mb-2">Gruplar</p>
                <div className="max-h-32 overflow-y-auto border border-navy-900/5 rounded-xl divide-y divide-navy-900/5">
                  {groups.map((g) => (
                    <label key={g.group_id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50">
                      <input type="checkbox" data-testid={`assign-group-${g.name}`} checked={form.group_ids.includes(g.group_id)} onChange={() => toggle("group_ids", g.group_id)} className="accent-navy-900" />
                      <span className="text-sm text-slate-700">{g.name}</span>
                      <span className="text-xs text-slate-400 ml-auto">{(g.member_ids || []).length} üye</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-slate-400 mb-1.5">Başlangıç (boş = hemen)</p>
                <input data-testid="assignment-start-input" type="datetime-local" min={minimumDateTime} max={MAX_ASSIGNMENT_DATE_TIME} step="60" className={inputCls} value={form.start_at} onChange={(e) => changeStartAt(e.target.value)} />
                {startDateFeedback && (
                  <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-amber-700 animate-in fade-in slide-in-from-top-1 duration-300">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                    {startDateFeedback}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1.5">Son tarih (opsiyonel)</p>
                <input data-testid="assignment-due-input" type="datetime-local" min={addLocalMinute(form.start_at || minimumDateTime)} max={MAX_ASSIGNMENT_DATE_TIME} step="60" className={inputCls} value={form.due_at} onChange={(e) => changeDueAt(e.target.value)} />
                {dueDateFeedback && (
                  <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-amber-700 animate-in fade-in slide-in-from-top-1 duration-300">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                    {dueDateFeedback}
                  </p>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1.5">Son tarihten kaç gün önce hatırlatmalar başlasın?</p>
              <input data-testid="assignment-reminder-input" type="number" min="0" max="365" disabled={!form.due_at} className={inputCls} value={form.reminder_days} onChange={(e) => setForm({ ...form, reminder_days: e.target.value })} />
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                Kullanıcıya son tarihe kalan gün sayısıyla birlikte günlük uygulama içi bildirim gösterilir. Örneğin 3 seçerseniz 3, 2 ve 1 gün kala hatırlatma yapılır; 0 seçerseniz kapatılır.
              </p>
            </div>
            <button data-testid="assignment-create-btn" className={btnPrimary + " w-full"} disabled={!form.training_id || (form.user_ids.length === 0 && form.group_ids.length === 0)} onClick={create}>
              Atamayı Oluştur
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
