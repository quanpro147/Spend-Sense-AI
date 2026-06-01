import { useState } from "react";
import { Download, Loader2, X } from "lucide-react";
import {
  getFinancialReport,
  type FinancialReport,
  type ReportRange,
} from "@/lib/api";
import { categoryMeta } from "@/lib/categories";
import { formatCurrency, formatDate, formatPercent } from "@/lib/utils";

interface FinancialReportModalProps {
  open: boolean;
  onClose: () => void;
}

const rangeLabels: Record<ReportRange, string> = {
  today: "Hôm nay",
  "7d": "7 ngày qua",
};

function signedCurrency(value: number): string {
  return `${value >= 0 ? "+" : ""}${formatCurrency(value)}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function printableReportHtml(report: FinancialReport): string {
  const rows = [
    ["Thu nhập", formatCurrency(report.income)],
    ["Chi tiêu", formatCurrency(report.expense)],
    ["Dư / tiết kiệm", signedCurrency(report.net)],
    ["Tỷ lệ tiết kiệm", formatPercent(report.saving_rate)],
  ];
  const section = (title: string, content: string) => `<section><h2>${escapeHtml(title)}</h2>${content}</section>`;
  const list = (items: string[]) => items.length
    ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : "<p>Chưa có dữ liệu.</p>";

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(report.title)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111827; padding: 28px; line-height: 1.55; }
    h1 { font-size: 28px; margin: 0 0 6px; }
    h2 { font-size: 18px; margin: 24px 0 10px; border-bottom: 1px solid #d8dee8; padding-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #d8dee8; padding: 8px; text-align: left; }
    th { background: #f1f5f9; }
    .muted { color: #52606d; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <button onclick="window.print()">Tải PDF</button>
  <h1>${escapeHtml(report.title)}</h1>
  <p class="muted">${escapeHtml(formatDate(report.start_date))} - ${escapeHtml(formatDate(report.end_date))}</p>
  ${section("Tổng quan", `<table><tbody>${rows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("")}</tbody></table>`)}
  ${section("Chi tiêu theo danh mục", report.category_breakdown.length ? `<table><thead><tr><th>Danh mục</th><th>Số tiền</th><th>Tỷ trọng</th></tr></thead><tbody>${report.category_breakdown.map((item) => `<tr><td>${escapeHtml(categoryMeta(item.category).label)}</td><td>${escapeHtml(formatCurrency(item.amount))}</td><td>${item.percent.toFixed(1)}%</td></tr>`).join("")}</tbody></table>` : "<p>Chưa có chi tiêu trong kỳ.</p>")}
  ${section("Chi tiêu lớn nhất", report.largest_transactions.length ? `<table><thead><tr><th>Tên</th><th>Danh mục</th><th>Số tiền</th></tr></thead><tbody>${report.largest_transactions.map((txn) => `<tr><td>${escapeHtml(txn.description || txn.merchant || "Giao dịch")}</td><td>${escapeHtml(categoryMeta(txn.category).label)}</td><td>${escapeHtml(formatCurrency(txn.amount))}</td></tr>`).join("")}</tbody></table>` : "<p>Chưa có chi tiêu trong kỳ.</p>")}
  ${section("Đầu tư", `<p>${escapeHtml(report.investment.assessment)}</p><p>Lãi/lỗ: ${escapeHtml(signedCurrency(report.investment.profit))} (${escapeHtml(formatPercent(report.investment.profit_percent))})</p>`)}
  ${section("Mục tiêu", report.goals.length ? `<table><thead><tr><th>Mục tiêu</th><th>Tiến độ</th><th>Hiện tại</th><th>Mục tiêu</th></tr></thead><tbody>${report.goals.map((goal) => `<tr><td>${escapeHtml(`${goal.emoji} ${goal.title}`)}</td><td>${goal.progress_percent.toFixed(1)}%</td><td>${escapeHtml(formatCurrency(goal.current_amount))}</td><td>${escapeHtml(formatCurrency(goal.target_amount))}</td></tr>`).join("")}</tbody></table>` : "<p>Bạn chưa thiết lập mục tiêu tài chính.</p>")}
  ${section("Nhận xét AI", `<p>${escapeHtml(report.ai_review.summary)}</p>${list(report.ai_review.observations)}`)}
  ${section("Gợi ý hành động", list(report.ai_review.suggested_actions))}
  <script>window.addEventListener("load", () => setTimeout(() => window.print(), 250));</script>
</body>
</html>`;
}

function downloadPdf(report: FinancialReport) {
  const popup = window.open("", "_blank", "width=900,height=700");
  if (!popup) return;
  popup.document.open();
  popup.document.write(printableReportHtml(report));
  popup.document.close();
}

export function FinancialReportModal({ open, onClose }: Readonly<FinancialReportModalProps>) {
  const [selectedRange, setSelectedRange] = useState<ReportRange>("7d");
  const [report, setReport] = useState<FinancialReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const generateReport = async (range: ReportRange) => {
    setSelectedRange(range);
    setLoading(true);
    setError("");
    try {
      setReport(await getFinancialReport(range));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tạo báo cáo.");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-soft w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-stitch-outline-variant">
          <div>
            <h2 className="font-heading text-xl font-bold text-stitch-on-surface">Báo Cáo Tài Chính</h2>
            <p className="text-sm text-stitch-on-surface-variant">Tạo báo cáo cá nhân hóa theo dữ liệu hiện tại của bạn.</p>
          </div>
          <button onClick={onClose} aria-label="Đóng" className="text-stitch-on-surface-variant hover:text-stitch-on-surface">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          <div className="flex flex-col sm:flex-row gap-3">
            {(["today", "7d"] as ReportRange[]).map((range) => (
              <button
                key={range}
                onClick={() => generateReport(range)}
                disabled={loading}
                className={`btn-outline flex-1 ${selectedRange === range ? "border-brand-blue text-brand-blue-dark bg-blue-50" : ""}`}
              >
                {rangeLabels[range]}
              </button>
            ))}
          </div>

          {loading && (
            <div className="py-12 flex items-center justify-center gap-2 text-stitch-on-surface-variant">
              <Loader2 className="w-5 h-5 animate-spin" />
              Đang tạo báo cáo...
            </div>
          )}

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          {!loading && !report && !error && (
            <div className="stitch-card p-lg text-center text-stitch-on-surface-variant">
              Chọn khoảng thời gian để tạo báo cáo.
            </div>
          )}

          {report && !loading && (
            <div className="space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h3 className="section-title">{report.title}</h3>
                  <p className="text-body-sm text-stitch-on-surface-variant">
                    {formatDate(report.start_date)} - {formatDate(report.end_date)}
                  </p>
                </div>
                <button onClick={() => downloadPdf(report)} className="btn-primary flex items-center gap-2 w-fit">
                  <Download className="w-4 h-4" />
                  Tải PDF
                </button>
              </div>

              <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  ["Thu nhập", formatCurrency(report.income)],
                  ["Chi tiêu", formatCurrency(report.expense)],
                  ["Dư / tiết kiệm", signedCurrency(report.net)],
                  ["Tỷ lệ tiết kiệm", formatPercent(report.saving_rate)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-stitch-outline-variant p-4">
                    <div className="text-label-caps text-stitch-on-surface-variant">{label}</div>
                    <div className="font-heading text-xl font-bold text-stitch-on-surface mt-1">{value}</div>
                  </div>
                ))}
              </section>

              <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-lg border border-stitch-outline-variant p-4">
                  <h4 className="font-heading font-semibold mb-3">Chi tiêu theo danh mục</h4>
                  <div className="space-y-2">
                    {report.category_breakdown.length === 0 && <p className="text-sm text-stitch-on-surface-variant">Chưa có chi tiêu trong kỳ.</p>}
                    {report.category_breakdown.map((item) => (
                      <div key={item.category} className="flex items-center justify-between gap-3 text-sm">
                        <span>{categoryMeta(item.category).label}</span>
                        <span className="font-semibold">{formatCurrency(item.amount)} · {item.percent.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-stitch-outline-variant p-4">
                  <h4 className="font-heading font-semibold mb-3">Chi tiêu lớn nhất</h4>
                  <div className="space-y-2">
                    {report.largest_transactions.length === 0 && <p className="text-sm text-stitch-on-surface-variant">Chưa có chi tiêu trong kỳ.</p>}
                    {report.largest_transactions.map((txn) => (
                      <div key={txn.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate">{txn.description || txn.merchant || "Giao dịch"}</span>
                        <span className="font-semibold">{formatCurrency(txn.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-stitch-outline-variant p-4">
                <h4 className="font-heading font-semibold mb-2">Đầu tư</h4>
                <p className="text-sm text-stitch-on-surface-variant">{report.investment.assessment}</p>
                <div className="mt-2 font-semibold">
                  Lãi/lỗ: {signedCurrency(report.investment.profit)} ({formatPercent(report.investment.profit_percent)})
                </div>
              </section>

              <section className="rounded-lg border border-stitch-outline-variant p-4">
                <h4 className="font-heading font-semibold mb-3">Tiến độ mục tiêu</h4>
                <div className="space-y-2">
                  {report.goals.length === 0 && <p className="text-sm text-stitch-on-surface-variant">Bạn chưa thiết lập mục tiêu tài chính.</p>}
                  {report.goals.map((goal) => (
                    <div key={goal.title} className="flex items-center justify-between gap-3 text-sm">
                      <span>{goal.emoji} {goal.title}</span>
                      <span className="font-semibold">{goal.progress_percent.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-stitch-outline-variant p-4 bg-blue-50/40">
                <h4 className="font-heading font-semibold mb-2">Nhận xét AI</h4>
                <p className="text-sm leading-relaxed text-stitch-on-surface-variant">{report.ai_review.summary}</p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                  <div>
                    <h5 className="font-semibold text-sm mb-2">Điểm đáng chú ý</h5>
                    <ul className="list-disc pl-5 text-sm space-y-1 text-stitch-on-surface-variant">
                      {report.ai_review.observations.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                  <div>
                    <h5 className="font-semibold text-sm mb-2">Gợi ý hành động</h5>
                    <ul className="list-disc pl-5 text-sm space-y-1 text-stitch-on-surface-variant">
                      {report.ai_review.suggested_actions.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
