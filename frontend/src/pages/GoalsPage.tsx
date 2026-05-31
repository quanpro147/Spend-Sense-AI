import { useState } from "react";
import { Plus, Sparkles, CheckCircle2, AlertTriangle, Clock, Trash2, X } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  createGoal,
  deleteGoal as apiDeleteGoal,
  listGoals,
  type GoalInput,
  type GoalRecord,
} from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";

const statusConfig: Record<GoalRecord["status"], { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  "on-track": { label: "Đúng tiến độ", cls: "bg-green-50 text-green-700", Icon: CheckCircle2 },
  "at-risk": { label: "Cần chú ý", cls: "bg-amber-50 text-amber-700", Icon: AlertTriangle },
  achieved: { label: "Hoàn thành", cls: "bg-green-50 text-green-700", Icon: CheckCircle2 },
};

const barColor: Record<GoalRecord["status"], string> = {
  "on-track": "#5BAAEC",
  "at-risk": "#F59E0B",
  achieved: "#22C55E",
};

function GoalCard({ goal, onDelete }: Readonly<{ goal: GoalRecord; onDelete: (id: string) => void }>) {
  const pct = Math.min(goal.progress_percent, 100);
  const { label, cls, Icon } = statusConfig[goal.status];

  return (
    <div className="stitch-card stitch-card-hover p-lg">
      {/* Goal Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{goal.emoji}</span>
          <div>
            <h4 className="font-heading text-h3-section text-stitch-on-surface">{goal.title}</h4>
            <p className="text-body-sm text-stitch-on-surface-variant mt-0.5">
              {goal.deadline ? `Hạn: ${formatDate(goal.deadline)}` : "Không có hạn"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-label-caps font-bold ${cls}`}>
            <Icon className="w-3.5 h-3.5" />
            {label}
          </span>
          <button
            onClick={() => onDelete(goal.id)}
            aria-label="Xóa mục tiêu"
            className="text-stitch-on-surface-variant hover:text-danger transition-colors p-1"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="space-y-2 mb-4">
        <div className="flex justify-between text-body-md">
          <span className="text-stitch-on-surface-variant">
            {formatCurrency(goal.current_amount)} / {formatCurrency(goal.target_amount)} VND
          </span>
          <span className="font-bold" style={{ color: barColor[goal.status] }}>
            {pct.toFixed(1)}%
          </span>
        </div>
        <div className="w-full bg-stitch-surface-container-high h-2.5 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, backgroundColor: barColor[goal.status] }}
          />
        </div>
      </div>

      {/* Monthly target */}
      {goal.monthly_target > 0 && (
        <div className="flex items-center justify-between bg-stitch-surface-container-low rounded-lg px-4 py-3 mb-4">
          <div className="flex items-center gap-2 text-stitch-on-surface-variant">
            <Clock className="w-4 h-4" />
            <span className="text-body-sm">Tiết kiệm/tháng</span>
          </div>
          <span className="font-heading font-semibold text-base text-stitch-on-surface">
            {formatCurrency(goal.monthly_target)}
          </span>
        </div>
      )}

      {/* AI note */}
      {goal.ai_note && (
        <div className="bg-stitch-surface-container-low border border-stitch-secondary-container rounded-lg p-4">
          <div className="flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-stitch-primary-container mt-0.5 flex-shrink-0" />
            <p className="text-body-sm text-stitch-on-surface-variant leading-relaxed">{goal.ai_note}</p>
          </div>
        </div>
      )}
    </div>
  );
}

const EMPTY_FORM: GoalInput = {
  title: "",
  emoji: "🎯",
  target_amount: 0,
  current_amount: 0,
  monthly_target: 0,
  deadline: null,
  ai_note: "",
};

function CreateGoalModal({
  onClose,
  onCreated,
}: Readonly<{ onClose: () => void; onCreated: () => void }>) {
  const [form, setForm] = useState<GoalInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!form.title.trim() || form.target_amount <= 0) {
      setError("Vui lòng nhập tên mục tiêu và số tiền mục tiêu hợp lệ.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createGoal({
        ...form,
        title: form.title.trim(),
        deadline: form.deadline || null,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tạo mục tiêu.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-soft w-full max-w-md p-lg space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="section-title">Thêm Mục Tiêu</h3>
          <button onClick={onClose} aria-label="Đóng" className="text-stitch-on-surface-variant hover:text-stitch-on-surface">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="w-20 space-y-1.5">
              <label className="text-label-caps text-stitch-on-surface-variant">Icon</label>
              <input
                type="text"
                value={form.emoji}
                onChange={(e) => setForm({ ...form, emoji: e.target.value })}
                className="stitch-input text-center"
                maxLength={4}
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <label className="text-label-caps text-stitch-on-surface-variant">Tên mục tiêu</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="stitch-input"
                placeholder="Quỹ khẩn cấp"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-label-caps text-stitch-on-surface-variant">Số tiền mục tiêu</label>
              <input
                type="number"
                value={form.target_amount || ""}
                onChange={(e) => setForm({ ...form, target_amount: Number(e.target.value) })}
                className="stitch-input"
                min={0}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-label-caps text-stitch-on-surface-variant">Đã tiết kiệm</label>
              <input
                type="number"
                value={form.current_amount || ""}
                onChange={(e) => setForm({ ...form, current_amount: Number(e.target.value) })}
                className="stitch-input"
                min={0}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-label-caps text-stitch-on-surface-variant">Tiết kiệm/tháng</label>
              <input
                type="number"
                value={form.monthly_target || ""}
                onChange={(e) => setForm({ ...form, monthly_target: Number(e.target.value) })}
                className="stitch-input"
                min={0}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-label-caps text-stitch-on-surface-variant">Hạn chót</label>
              <input
                type="date"
                value={form.deadline ?? ""}
                onChange={(e) => setForm({ ...form, deadline: e.target.value || null })}
                className="stitch-input"
              />
            </div>
          </div>

          {error && <p className="text-body-sm text-danger">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="btn-outline">Hủy</button>
          <button onClick={submit} disabled={saving} className="btn-primary">
            {saving ? "Đang lưu…" : "Tạo mục tiêu"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function GoalsPage() {
  const { data, loading, error, reload } = useApiData(() => listGoals(), []);
  const [showCreate, setShowCreate] = useState(false);

  const handleDelete = async (id: string) => {
    if (!window.confirm("Bạn có chắc muốn xóa mục tiêu này?")) return;
    try {
      await apiDeleteGoal(id);
      reload();
    } catch {
      // surfaced via reload showing unchanged list; keep silent failure minimal
      window.alert("Không thể xóa mục tiêu. Vui lòng thử lại.");
    }
  };

  const goals = data ?? [];
  const totalSaved = goals.reduce((s, g) => s + g.current_amount, 0);
  const totalTarget = goals.reduce((s, g) => s + g.target_amount, 0);
  const achieved = goals.filter((g) => g.status === "achieved").length;

  return (
    <div className="space-y-xxl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-h2-kpi text-stitch-on-surface">Mục Tiêu Tài Chính</h1>
          <p className="text-body-lg text-stitch-on-surface-variant mt-1">Theo dõi và chinh phục mục tiêu của bạn</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-5 h-5" />
          Thêm Mục Tiêu
        </button>
      </div>

      {loading && <div className="py-20 text-center text-stitch-on-surface-variant">Đang tải mục tiêu…</div>}

      {error && (
        <div className="py-20 text-center space-y-3">
          <p className="text-danger">{error}</p>
          <button onClick={reload} className="btn-outline">Thử lại</button>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Summary */}
          <section className="grid grid-cols-3 gap-lg">
            {[
              { label: "Tổng mục tiêu", value: `${goals.length}`, color: "text-stitch-on-surface" },
              { label: "Đã hoàn thành", value: `${achieved}`, color: "text-success" },
              { label: "Tổng tiến độ", value: `${totalTarget > 0 ? ((totalSaved / totalTarget) * 100).toFixed(0) : 0}%`, color: "text-stitch-primary-container" },
            ].map((s) => (
              <div key={s.label} className="stitch-card stitch-card-hover p-lg text-center">
                <div className={`font-heading text-h2-kpi font-bold ${s.color}`}>{s.value}</div>
                <div className="text-body-sm text-stitch-on-surface-variant mt-1">{s.label}</div>
              </div>
            ))}
          </section>

          {/* Goals Grid */}
          {goals.length === 0 ? (
            <div className="stitch-card p-lg text-center text-stitch-on-surface-variant">
              Chưa có mục tiêu nào. Nhấn "Thêm Mục Tiêu" để tạo mục tiêu đầu tiên của bạn.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-lg">
              {goals.map((goal) => <GoalCard key={goal.id} goal={goal} onDelete={handleDelete} />)}
            </div>
          )}
        </>
      )}

      {showCreate && <CreateGoalModal onClose={() => setShowCreate(false)} onCreated={reload} />}
    </div>
  );
}
