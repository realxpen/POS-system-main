import { useEffect, useState } from 'react';
import { Bell, AlertTriangle, Clock3, CheckCircle2 } from 'lucide-react';

type Reminder = {
  key: string;
  title: string;
  frequency: string;
  due_date: string;
  due_in_days: number;
  level: 'overdue' | 'due_today' | 'due_soon' | 'upcoming';
};

type CompliancePayload = {
  reminder_days_before: number;
  reminders: Reminder[];
};

export default function Notifications() {
  const [data, setData] = useState<CompliancePayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/api/reports/compliance-reminders');
        const payload = await res.json();
        setData(payload);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  if (loading) return <div className="p-8 enter-up">Loading notifications...</div>;

  const reminders = data?.reminders || [];

  return (
    <div className="space-y-6 enter-up">
      <div className="panel-card rounded-2xl p-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="text-gray-500">Compliance reminders and due-date alerts.</p>
        </div>
        <div className="chip">
          <Bell className="h-4 w-4" />
          {reminders.length} alerts
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {reminders.map((r) => {
          const levelClass = r.level === 'overdue'
            ? 'bg-red-50 border-red-200 text-red-700'
            : r.level === 'due_today'
              ? 'bg-amber-50 border-amber-200 text-amber-700'
              : r.level === 'due_soon'
                ? 'bg-orange-50 border-orange-200 text-orange-700'
                : 'bg-emerald-50 border-emerald-200 text-emerald-700';

          const Icon = r.level === 'overdue'
            ? AlertTriangle
            : r.level === 'due_today' || r.level === 'due_soon'
              ? Clock3
              : CheckCircle2;

          const countdown = r.due_in_days < 0
            ? `${Math.abs(r.due_in_days)} days overdue`
            : r.due_in_days === 0
              ? 'Due today'
              : `${r.due_in_days} days left`;

          return (
            <div key={r.key} className={`rounded-xl border px-4 py-4 ${levelClass}`}>
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold text-sm">{r.title}</p>
                <Icon className="h-4 w-4" />
              </div>
              <p className="text-xs">Due: {r.due_date}</p>
              <p className="text-xs font-medium mt-1">{countdown}</p>
              <p className="text-[11px] mt-2 uppercase tracking-wide opacity-80">{r.frequency}</p>
            </div>
          );
        })}
        {reminders.length === 0 && (
          <div className="panel-card rounded-xl p-4 text-sm text-gray-500">
            No notifications yet.
          </div>
        )}
      </div>
    </div>
  );
}
