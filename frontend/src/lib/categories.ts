// Category metadata: maps backend category `value` → display label, icon, color.
// Mirrors RECEIPT_CATEGORIES in src/llm/gemini_client.py.

export interface CategoryMeta {
  label: string;
  icon: string;
  color: string;
}

export const CATEGORY_META: Record<string, CategoryMeta> = {
  "an-uong": { label: "Ăn uống", icon: "🍱", color: "#5BAAEC" },
  "di-chuyen": { label: "Di chuyển", icon: "⛽", color: "#F59E0B" },
  "mua-sam": { label: "Mua sắm", icon: "🛍️", color: "#A78BFA" },
  "nha-o": { label: "Nhà ở", icon: "🏠", color: "#22C55E" },
  "suc-khoe": { label: "Sức khỏe", icon: "🏥", color: "#34D399" },
  "giai-tri": { label: "Giải trí", icon: "🎬", color: "#FB923C" },
  "giao-duc": { label: "Giáo dục", icon: "📚", color: "#60A5FA" },
  "dau-tu": { label: "Đầu tư", icon: "📈", color: "#10B981" },
  luong: { label: "Lương", icon: "💼", color: "#22C55E" },
  thuong: { label: "Thưởng", icon: "🎁", color: "#F472B6" },
  khac: { label: "Khác", icon: "💳", color: "#94A3B8" },
};

const FALLBACK: CategoryMeta = { label: "Khác", icon: "💳", color: "#94A3B8" };

export function categoryMeta(value: string | undefined | null): CategoryMeta {
  if (!value) return FALLBACK;
  return CATEGORY_META[value] ?? { ...FALLBACK, label: value };
}
