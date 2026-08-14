export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    NOT_STARTED: "bg-slate-100 text-slate-700",
    IN_PROGRESS: "bg-sky-100 text-sky-800",
    COMPLETED: "bg-emerald-100 text-emerald-800",
    FAILED: "bg-rose-100 text-rose-800",
    OVERDUE: "bg-amber-100 text-amber-900",
  };
  const labels: Record<string, string> = {
    NOT_STARTED: "Başlanmadı",
    IN_PROGRESS: "Devam ediyor",
    COMPLETED: "Tamamlandı",
    FAILED: "Başarısız",
    OVERDUE: "Süresi geçti",
  };
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${map[status] || map.NOT_STARTED}`}
    >
      {labels[status] || status}
    </span>
  );
}
