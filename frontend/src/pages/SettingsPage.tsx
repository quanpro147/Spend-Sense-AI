import { useEffect, useState } from "react";
import { User, Bell, Shield, Sparkles, Save, Camera } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import {
  getPreferences,
  updatePreferences,
  type PreferenceKey,
  type PreferencesRecord,
} from "@/lib/api";

const tabs = [
  { id: "profile", label: "Hồ Sơ", icon: User },
  { id: "notifications", label: "Thông Báo", icon: Bell },
  { id: "security", label: "Bảo Mật", icon: Shield },
  { id: "ai", label: "AI Copilot", icon: Sparkles },
];

const riskOptions = [
  { value: "conservative", label: "Thận trọng", desc: "Ưu tiên bảo toàn vốn" },
  { value: "moderate", label: "Trung bình", desc: "Cân bằng tăng trưởng và an toàn" },
  { value: "aggressive", label: "Tăng trưởng", desc: "Tối đa hóa lợi nhuận" },
];

const PREF_META: Array<{ key: PreferenceKey; label: string; description: string }> = [
  { key: "weekly_report", label: "Báo cáo AI hàng tuần", description: "Nhận bản tóm tắt thông minh về chi tiêu và xu hướng của bạn mỗi thứ Hai." },
  { key: "rebalance_suggestions", label: "Gợi ý tái cân bằng danh mục", description: "AI đề xuất điều chỉnh danh mục khi thị trường có biến động lớn." },
  { key: "anomaly_alerts", label: "Cảnh báo chi tiêu bất thường", description: "Thông báo ngay khi AI phát hiện giao dịch vượt ngưỡng hoặc bất thường." },
  { key: "goal_reminders", label: "Nhắc nhở mục tiêu tiết kiệm", description: "Gửi thông báo khi tiến độ mục tiêu chậm hơn kế hoạch." },
];

function avatarUrl(email: string): string {
  const name = encodeURIComponent(email.split("@")[0] || "User");
  return `https://ui-avatars.com/api/?name=${name}&background=5BAAEC&color=fff&size=128`;
}

export function SettingsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("profile");
  const [riskLevel, setRiskLevel] = useState<string>("moderate");

  const [prefs, setPrefs] = useState<PreferencesRecord | null>(null);
  const [prefsError, setPrefsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPreferences()
      .then((p) => { if (!cancelled) setPrefs(p); })
      .catch((err) => { if (!cancelled) setPrefsError(err instanceof Error ? err.message : "Không tải được tùy chọn AI."); });
    return () => { cancelled = true; };
  }, []);

  const togglePref = async (key: PreferenceKey) => {
    if (!prefs) return;
    const next = !prefs[key];
    setPrefs({ ...prefs, [key]: next }); // optimistic
    try {
      const updated = await updatePreferences({ [key]: next });
      setPrefs(updated);
    } catch {
      setPrefs({ ...prefs, [key]: !next }); // rollback
      setPrefsError("Không thể lưu tùy chọn. Vui lòng thử lại.");
    }
  };

  const email = user?.email ?? "";

  return (
    <div className="space-y-xxl">
      <div>
        <h1 className="font-heading text-h2-kpi text-stitch-on-surface">Cài Đặt</h1>
        <p className="text-body-lg text-stitch-on-surface-variant mt-1">Quản lý tài khoản và tùy chỉnh AI Copilot</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-xl">
        {/* Sidebar */}
        <div className="lg:w-56 flex-shrink-0 space-y-4">
          {/* Profile summary */}
          <div className="stitch-card p-lg flex flex-col items-center text-center">
            <div className="relative">
              <img src={avatarUrl(email)} alt={email} className="rounded-full border-2 border-stitch-primary-container/40" style={{ width: 72, height: 72 }} />
              <button className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-stitch-primary-container text-stitch-on-primary-container flex items-center justify-center shadow-soft hover:scale-110 transition-transform">
                <Camera className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="font-heading font-semibold text-base text-stitch-on-surface mt-3 break-all">{email || "Người dùng"}</p>
          </div>

          {/* Tabs */}
          <nav className="flex flex-row lg:flex-col gap-1">
            {tabs.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn("nav-link w-full text-left", activeTab === tab.id && "active")}>
                <tab.icon className="flex-shrink-0" style={{ width: 18, height: 18 }} />
                <span className="hidden lg:inline">{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-5">

          {/* PROFILE */}
          {activeTab === "profile" && (
            <div className="stitch-card p-lg space-y-5">
              <div>
                <h3 className="section-title">Thông Tin Cá Nhân</h3>
                <p className="text-body-sm text-stitch-on-surface-variant mt-1">Email tài khoản và hồ sơ rủi ro</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-label-caps text-stitch-on-surface-variant">Email</label>
                  <input type="email" value={email} readOnly className="stitch-input bg-stitch-surface-container-low" />
                </div>
              </div>

              {/* Risk Profile (local preview) */}
              <div className="space-y-3 pt-4 border-t border-stitch-outline-variant/60">
                <label className="text-label-caps text-stitch-on-surface-variant">Hồ sơ rủi ro đầu tư</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {riskOptions.map((opt) => (
                    <button key={opt.value} onClick={() => setRiskLevel(opt.value)}
                      className={cn("p-4 rounded-lg border text-left transition-all",
                        riskLevel === opt.value ? "border-stitch-primary-container bg-stitch-primary-container/5 shadow-ai-glow" : "border-stitch-outline-variant hover:border-stitch-primary-container/50")}>
                      <div className="font-semibold text-base text-stitch-on-surface">{opt.label}</div>
                      <div className="text-body-sm text-stitch-on-surface-variant mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
                <p className="text-body-sm text-stitch-on-surface-variant">Hồ sơ rủi ro được quản lý trong trang Đầu tư.</p>
              </div>
            </div>
          )}

          {/* NOTIFICATIONS — backed by AI preferences */}
          {activeTab === "notifications" && (
            <div className="stitch-card p-lg space-y-4">
              <div>
                <h3 className="section-title">Tùy Chỉnh Thông Báo</h3>
                <p className="text-body-sm text-stitch-on-surface-variant mt-1">Chọn loại thông báo bạn muốn nhận</p>
              </div>
              {prefsError && <p className="text-body-sm text-danger">{prefsError}</p>}
              {PREF_META.map((meta) => (
                <div key={meta.key} className="flex items-center justify-between p-4 rounded-lg border border-stitch-outline-variant/60 hover:bg-stitch-surface-container-low transition-colors">
                  <div>
                    <p className="font-semibold text-base text-stitch-on-surface">{meta.label}</p>
                    <p className="text-body-sm text-stitch-on-surface-variant">{meta.description}</p>
                  </div>
                  <Switch checked={prefs ? prefs[meta.key] : false} onCheckedChange={() => togglePref(meta.key)} disabled={!prefs} />
                </div>
              ))}
            </div>
          )}

          {/* SECURITY */}
          {activeTab === "security" && (
            <div className="stitch-card p-lg space-y-5">
              <div>
                <h3 className="section-title">Bảo Mật Tài Khoản</h3>
                <p className="text-body-sm text-stitch-on-surface-variant mt-1">Quản lý mật khẩu và xác thực 2 lớp</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-label-caps text-stitch-on-surface-variant">Mật khẩu hiện tại</label>
                <input type="password" placeholder="••••••••" className="stitch-input" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-label-caps text-stitch-on-surface-variant">Mật khẩu mới</label>
                  <input type="password" placeholder="••••••••" className="stitch-input" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-label-caps text-stitch-on-surface-variant">Xác nhận mật khẩu</label>
                  <input type="password" placeholder="••••••••" className="stitch-input" />
                </div>
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg border border-stitch-outline-variant/60">
                <div>
                  <p className="font-semibold text-base text-stitch-on-surface">Xác thực 2 lớp (2FA)</p>
                  <p className="text-body-sm text-stitch-on-surface-variant">Thêm lớp bảo vệ với Google Authenticator</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="bg-red-50 text-red-700 px-3 py-1 rounded-full text-label-caps font-bold">Chưa bật</span>
                  <button className="btn-outline text-sm px-4 py-2">Bật ngay</button>
                </div>
              </div>
              <div className="flex justify-end">
                <button className="btn-primary flex items-center gap-2">
                  <Save className="w-4 h-4" />
                  Cập Nhật Mật Khẩu
                </button>
              </div>
            </div>
          )}

          {/* AI COPILOT — backed by AI preferences */}
          {activeTab === "ai" && (
            <div className="stitch-card p-lg space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-stitch-primary-container flex items-center justify-center shadow-ai-glow">
                  <Sparkles className="w-5 h-5 text-stitch-on-primary-container" />
                </div>
                <div>
                  <h3 className="section-title leading-none">Tùy Chỉnh AI Copilot</h3>
                  <p className="text-body-sm text-stitch-on-surface-variant mt-0.5">Điều chỉnh cách AI phân tích và tư vấn</p>
                </div>
              </div>
              {prefsError && <p className="text-body-sm text-danger">{prefsError}</p>}
              {PREF_META.map((meta) => (
                <div key={meta.key} className="flex items-center justify-between p-4 rounded-lg border border-stitch-outline-variant/60 hover:border-stitch-primary-container/30 hover:bg-blue-50/20 transition-all">
                  <div className="flex-1 mr-5">
                    <p className="font-semibold text-base text-stitch-on-surface">{meta.label}</p>
                    <p className="text-body-sm text-stitch-on-surface-variant mt-0.5">{meta.description}</p>
                  </div>
                  <Switch checked={prefs ? prefs[meta.key] : false} onCheckedChange={() => togglePref(meta.key)} disabled={!prefs} />
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
