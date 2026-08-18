import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/Layout";
import { Mail, BellRing, Send } from "lucide-react";

const TYPE_META = {
  activation: { label: "Aktivasyon", icon: Mail, cls: "bg-brand-50 text-brand-700" },
  assignment: { label: "Atama", icon: Send, cls: "bg-navy-50 text-navy-700" },
  reminder: { label: "Hatırlatma", icon: BellRing, cls: "bg-amber-50 text-amber-600" },
};

export default function NotificationsPage() {
  const [emails, setEmails] = useState([]);

  useEffect(() => {
    api.get("/emails").then((r) => setEmails(r.data));
  }, []);

  return (
    <div className="fade-up" data-testid="notifications-page">
      <PageHeader
        overline="İletişim"
        title="Bildirimler"
        subtitle="Gönderilen e-postaların kaydı."
      />
      <div className="space-y-3 max-w-3xl">
        {emails.length === 0 && <p className="text-sm text-slate-400">Henüz bildirim gönderilmedi.</p>}
        {emails.map((m) => {
          const meta = TYPE_META[m.type] || TYPE_META.activation;
          return (
            <div key={m.email_id} className="n-card p-6" data-testid={`email-log-${m.email_id}`}>
              <div className="flex items-center gap-3 mb-3">
                <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${meta.cls}`}>
                  <meta.icon className="w-3 h-3" /> {meta.label}
                </span>
                <span className="text-xs text-slate-400">→ {m.to}</span>
                <span className="text-xs text-slate-300 ml-auto">{new Date(m.created_at).toLocaleString("tr-TR")}</span>
              </div>
              <p className="text-sm font-medium text-navy-950 mb-1">{m.subject}</p>
              <p className="text-sm text-slate-500 leading-relaxed">{m.body}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
