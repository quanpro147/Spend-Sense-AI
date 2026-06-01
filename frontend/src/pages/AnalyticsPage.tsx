import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import { Edit3, Filter, Loader2, X } from "lucide-react";
import { listTransactions, updateTransaction, type TransactionRecord } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { CATEGORY_META } from "@/lib/categories";
import {
  deriveExpenseByCategory,
  deriveMonthlyTrend,
  deriveWalletSummary,
  deriveWeeklyExpense,
  toRecentTransactions,
} from "@/lib/derive";

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div className="bg-white border border-stitch-outline-variant rounded-lg p-3 shadow-soft text-sm">
        <p className="font-semibold mb-1">{label}</p>
        <p style={{ color: payload[0].color || "#5BAAEC" }}>{formatCurrency(payload[0].value)}</p>
      </div>
    );
  }
  return null;
};

const categoryOptions = Object.entries(CATEGORY_META).map(([value, meta]) => ({
  value,
  label: meta.label,
}));

interface EditTransactionForm {
  type: "expense" | "income";
  amount: string;
  category: string;
  description: string;
  transaction_date: string;
}

function toDateInputValue(txn: TransactionRecord): string {
  return (txn.transaction_date ?? txn.created_at).slice(0, 10);
}

function EditTransactionModal({
  transaction,
  onClose,
  onSaved,
}: Readonly<{
  transaction: TransactionRecord;
  onClose: () => void;
  onSaved: () => void;
}>) {
  const [form, setForm] = useState<EditTransactionForm>({
    type: transaction.type,
    amount: String(transaction.amount),
    category: transaction.category,
    description: transaction.description,
    transaction_date: toDateInputValue(transaction),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    const amount = Number(form.amount);
    if (!form.description.trim()) {
      setError("Vui lòng nhập tên giao dịch.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Vui lòng nhập số tiền hợp lệ.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await updateTransaction(transaction.id, {
        type: form.type,
        amount,
        currency: transaction.currency,
        category: form.category,
        description: form.description.trim(),
        merchant: transaction.merchant,
        transaction_date: form.transaction_date || null,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể cập nhật giao dịch.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-soft w-full max-w-lg p-lg space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="section-title">Chỉnh Sửa Giao Dịch</h3>
          <button onClick={onClose} aria-label="Đóng" className="text-stitch-on-surface-variant hover:text-stitch-on-surface">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <div className="flex gap-2 bg-stitch-surface-container p-1 rounded-lg">
            {(["expense", "income"] as const).map((type) => (
              <button
                key={type}
                onClick={() => setForm((current) => ({ ...current, type }))}
                className={`flex-1 py-2 rounded-md text-sm font-semibold transition-all ${
                  form.type === type
                    ? "bg-white shadow-soft text-stitch-on-surface"
                    : "text-stitch-on-surface-variant"
                }`}
              >
                {type === "expense" ? "Chi" : "Thu"}
              </button>
            ))}
          </div>

          <label className="space-y-1.5">
            <span className="text-label-caps text-stitch-on-surface-variant">Tên giao dịch</span>
            <input
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              className="stitch-input"
              placeholder="Tên món hoặc nguồn thu"
            />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="space-y-1.5">
              <span className="text-label-caps text-stitch-on-surface-variant">Số tiền</span>
              <input
                type="number"
                min={0}
                value={form.amount}
                onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                className="stitch-input"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-label-caps text-stitch-on-surface-variant">Ngày</span>
              <input
                type="date"
                value={form.transaction_date}
                onChange={(event) => setForm((current) => ({ ...current, transaction_date: event.target.value }))}
                className="stitch-input"
              />
            </label>
          </div>

          <label className="space-y-1.5">
            <span className="text-label-caps text-stitch-on-surface-variant">Danh mục</span>
            <select
              value={form.category}
              onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
              className="stitch-input"
            >
              {categoryOptions.map((category) => (
                <option key={category.value} value={category.value}>{category.label}</option>
              ))}
            </select>
          </label>
        </div>

        {error && <p className="text-body-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="btn-outline">Hủy</button>
          <button onClick={submit} disabled={saving} className="btn-primary flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Lưu thay đổi
          </button>
        </div>
      </div>
    </div>
  );
}

export function AnalyticsPage() {
  const { data: transactions, loading, error, reload } = useApiData(() => listTransactions(), []);
  const [editingTransaction, setEditingTransaction] = useState<TransactionRecord | null>(null);
  const txns = transactions ?? [];
  const transactionsById = useMemo(() => new Map(txns.map((txn) => [txn.id, txn])), [txns]);

  if (loading) {
    return <div className="py-20 text-center text-stitch-on-surface-variant">Đang tải dữ liệu phân tích…</div>;
  }
  if (error) {
    return (
      <div className="py-20 text-center space-y-3">
        <p className="text-danger">{error}</p>
        <button onClick={reload} className="btn-outline">Thử lại</button>
      </div>
    );
  }

  const expenseByCategory = deriveExpenseByCategory(txns);
  const weeklyExpense = deriveWeeklyExpense(txns);
  const monthlyTrend = deriveMonthlyTrend(txns);
  const recentTransactions = toRecentTransactions(txns, txns.length);
  const summary = deriveWalletSummary(txns);
  const totalExpense = expenseByCategory.reduce((s, c) => s + c.value, 0);

  return (
    <div className="space-y-xxl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-h2-kpi text-stitch-on-surface">Phân Tích Chi Tiêu</h1>
          <p className="text-body-lg text-stitch-on-surface-variant mt-1">Dựa trên giao dịch thực của bạn</p>
        </div>
        <button className="flex items-center gap-2 border border-stitch-outline-variant px-4 py-2.5 rounded-lg text-base font-medium text-stitch-on-surface hover:bg-stitch-surface-container transition-colors">
          <Filter className="w-4 h-4" />
          Bộ lọc
        </button>
      </div>

      {txns.length === 0 && (
        <div className="stitch-card p-lg text-center text-stitch-on-surface-variant">
          Chưa có giao dịch nào. Hãy thêm giao dịch hoặc tải lên hóa đơn để xem phân tích.
        </div>
      )}

      {/* Summary Cards */}
      <section className="grid grid-cols-3 gap-lg">
        {[
          { label: "Tổng chi tiêu", value: formatCurrency(totalExpense), green: false },
          { label: "Tiết kiệm tháng", value: formatCurrency(summary.monthlySaving), green: true },
          { label: "Số danh mục", value: `${expenseByCategory.length}`, green: false },
        ].map((s) => (
          <div key={s.label} className="stitch-card stitch-card-hover p-lg text-center">
            <div className={`font-heading text-h2-kpi font-bold ${s.green ? "text-success" : "text-stitch-on-surface"}`}>{s.value}</div>
            <div className="text-body-sm text-stitch-on-surface-variant mt-1">{s.label}</div>
          </div>
        ))}
      </section>

      {/* Charts Row */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-xl">
        {/* Pie */}
        <div className="stitch-card p-lg">
          <h3 className="section-title mb-lg">Phân Bổ Theo Danh Mục</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={expenseByCategory} cx="50%" cy="50%" innerRadius={65} outerRadius={95}
                paddingAngle={3} dataKey="value" labelLine={false}
                label={({ cx = 0, cy = 0, midAngle = 0, outerRadius: or = 0, percent = 0 }) => {
                  const R = Math.PI / 180;
                  const r = or + 22;
                  const x = cx + r * Math.cos(-midAngle * R);
                  const y = cy + r * Math.sin(-midAngle * R);
                  const normalizedPercent = percent > 1 ? percent : percent * 100;
                  if (normalizedPercent < 7) return null;
                  return <text x={x} y={y} fill="#404750" textAnchor={x > cx ? "start" : "end"} dominantBaseline="central" fontSize={12}>{`${normalizedPercent.toFixed(1)}%`}</text>;
                }}
              >
                {expenseByCategory.map((e) => <Cell key={e.name} fill={e.color} />)}
              </Pie>
              <Legend iconType="circle" iconSize={10} formatter={(v) => <span className="text-body-sm text-stitch-on-surface">{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Weekly Bar */}
        <div className="stitch-card p-lg">
          <div className="flex items-center justify-between mb-lg">
            <h3 className="section-title">Chi Tiêu Tuần Này</h3>
            <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-label-caps">7 ngày</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={weeklyExpense} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <XAxis dataKey="day" tick={{ fontSize: 13, fill: "#404750" }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="amount" fill="#5BAAEC" radius={[8, 8, 0, 0]} maxBarSize={44} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Line Chart */}
      <div className="stitch-card p-lg">
        <h3 className="section-title mb-lg">Xu Hướng Thu Chi 7 Tháng</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={monthlyTrend} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#404750" }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip formatter={(v: unknown, n: unknown) => [formatCurrency(Number(v ?? 0)), n === "thuNhap" ? "Thu nhập" : "Chi tiêu"]} />
            <Line type="monotone" dataKey="thuNhap" stroke="#5BAAEC" strokeWidth={2.5} dot={{ r: 4, fill: "#5BAAEC" }} />
            <Line type="monotone" dataKey="chiTieu" stroke="#F59E0B" strokeWidth={2.5} dot={{ r: 4, fill: "#F59E0B" }} strokeDasharray="5 3" />
          </LineChart>
        </ResponsiveContainer>
        <div className="flex gap-5 mt-3 text-body-sm text-stitch-on-surface-variant">
          <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-stitch-primary-container rounded-full inline-block" />Thu nhập</span>
          <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-warning rounded-full inline-block" />Chi tiêu</span>
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="stitch-card p-lg">
        <h3 className="section-title mb-lg">Chi Tiết Danh Mục</h3>
        <div className="space-y-4">
          {expenseByCategory.map((cat) => (
            <div key={cat.name} className="flex items-center gap-4">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-base mb-1.5">
                  <span className="font-medium text-stitch-on-surface">{cat.name}</span>
                  <span className="text-stitch-on-surface-variant tabular-nums">{formatCurrency(cat.value)}</span>
                </div>
                <div className="h-2 rounded-full bg-stitch-surface-container-high overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${cat.percent}%`, backgroundColor: cat.color }} />
                </div>
              </div>
              <div className="w-10 text-right text-body-sm text-stitch-on-surface-variant tabular-nums font-semibold">{cat.percent}%</div>
            </div>
          ))}
        </div>
      </div>

      {/* All Transactions */}
      <div className="stitch-card p-lg">
        <div className="flex items-center justify-between mb-lg">
          <h3 className="section-title">Tất Cả Giao Dịch</h3>
          <span className="border border-stitch-outline-variant text-stitch-on-surface-variant px-3 py-1 rounded-full text-body-sm">
            {recentTransactions.length} giao dịch
          </span>
        </div>
        <div className="divide-y divide-stitch-outline-variant/60">
          {recentTransactions.map((txn) => (
            <div key={txn.id} className="flex items-center gap-4 py-3.5">
              <div className="w-11 h-11 rounded-lg bg-stitch-surface-container flex items-center justify-center text-xl flex-shrink-0">{txn.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="text-base font-medium text-stitch-on-surface truncate">{txn.description}</div>
                <div className="text-body-sm text-stitch-on-surface-variant">{txn.category}</div>
              </div>
              <div className="text-right">
                <div className={`text-base font-bold tabular-nums ${txn.type === "income" ? "text-success" : "text-stitch-on-surface"}`}>
                  {txn.type === "income" ? "+" : ""}{formatCurrency(Math.abs(txn.amount))}
                </div>
                <div className="flex items-center justify-end gap-2 mt-1">
                  <span className={`text-label-caps px-2 py-0.5 rounded-full ${txn.type === "income" ? "bg-green-50 text-green-700" : "bg-stitch-surface-container text-stitch-on-surface-variant"}`}>
                    {txn.type === "income" ? "Thu" : "Chi"}
                  </span>
                  <button
                    onClick={() => {
                      const raw = transactionsById.get(txn.id);
                      if (raw) setEditingTransaction(raw);
                    }}
                    aria-label="Chỉnh sửa giao dịch"
                    className="w-7 h-7 rounded-md border border-stitch-outline-variant text-stitch-on-surface-variant hover:text-brand-blue-dark hover:bg-blue-50 flex items-center justify-center transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editingTransaction && (
        <EditTransactionModal
          transaction={editingTransaction}
          onClose={() => setEditingTransaction(null)}
          onSaved={reload}
        />
      )}
    </div>
  );
}
