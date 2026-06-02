import React, { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  Zap,
  Plus,
  Trash2,
  Settings,
  Activity,
  Coins,
  Loader2,
  TrendingDown,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell as BarCell,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { formatCurrency, formatPercent } from "@/lib/utils";
import {
  getInvestmentProfile,
  saveInvestmentProfile,
  getPortfolio,
  addAsset,
  deleteAsset,
  getStressTest,
  parseAssetWithAI,
  getMarketPrice,
} from "@/lib/api";
import type {
  InvestmentProfile,
  InvestmentAsset,
  StressTestResult,
} from "@/lib/api";

const POPULAR_SYMBOLS = [
  { symbol: "FPT", name: "Cổ phiếu FPT", type: "stock", color: "#5BAAEC" },
  { symbol: "VNM", name: "Cổ phiếu Vinamilk", type: "stock", color: "#22C55E" },
  { symbol: "TCB", name: "Cổ phiếu Techcombank", type: "stock", color: "#A78BFA" },
  { symbol: "HPG", name: "Cổ phiếu Hòa Phát", type: "stock", color: "#707881" },
  { symbol: "MWG", name: "Cổ phiếu Thế Giới Di Động", type: "stock", color: "#F59E0B" },
  { symbol: "VCB", name: "Cổ phiếu Vietcombank", type: "stock", color: "#5BAAEC" },
  { symbol: "VHM", name: "Cổ phiếu Vinhomes", type: "stock", color: "#FB923C" },
  { symbol: "VIC", name: "Cổ phiếu Vingroup", type: "stock", color: "#A78BFA" },
  { symbol: "CTG", name: "Cổ phiếu VietinBank", type: "stock", color: "#22C55E" },
  { symbol: "BID", name: "Cổ phiếu BIDV", type: "stock", color: "#FB923C" },
  { symbol: "MBB", name: "Cổ phiếu MBBank", type: "stock", color: "#5BAAEC" },
  { symbol: "VPB", name: "Cổ phiếu VPBank", type: "stock", color: "#F59E0B" },
  { symbol: "STB", name: "Cổ phiếu Sacombank", type: "stock", color: "#EC4899" },
  { symbol: "ACB", name: "Cổ phiếu ACB", type: "stock", color: "#22C55E" },
  { symbol: "SSI", name: "Cổ phiếu Chứng Khoán SSI", type: "stock", color: "#707881" },
  { symbol: "SJC", name: "Vàng SJC", type: "gold", color: "#F59E0B" },
  { symbol: "GOLD", name: "Vàng SJC", type: "gold", color: "#F59E0B" },
  { symbol: "BTC", name: "Bitcoin", type: "crypto", color: "#FB923C" },
  { symbol: "ETH", name: "Ethereum", type: "crypto", color: "#A78BFA" },
  { symbol: "SAVING", name: "Gửi Tiết Kiệm", type: "saving", color: "#EC4899" },
];

const riskLabels = { conservative: "Thận trọng", moderate: "Trung bình", aggressive: "Tăng trưởng" };
const riskClasses = {
  conservative: "bg-blue-50 text-blue-700 border border-blue-250",
  moderate: "bg-amber-50 text-amber-700 border border-amber-250",
  aggressive: "bg-red-50 text-red-700 border border-red-250",
} as const;

export function InvestmentPage() {
  const [profile, setProfile] = useState<InvestmentProfile | null>(null);
  const [portfolioAssets, setPortfolioAssets] = useState<InvestmentAsset[]>([]);
  const [stressResult, setStressResult] = useState<StressTestResult | null>(null);
  const [activeTab, setActiveTab] = useState<"portfolio" | "stresstest">("portfolio");
  
  // Loading states
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingPortfolio, setLoadingPortfolio] = useState(true);
  const [loadingStress, setLoadingStress] = useState(false);
  
  // Modal states
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [modalMode, setModalMode] = useState<"ai" | "manual">("ai");
  
  // Form states
  const [profileForm, setProfileForm] = useState({ risk_appetite: "moderate", capital: 0, goal: "" });
  const [assetForm, setAssetForm] = useState({ symbol: "", name: "", type: "stock", quantity: 1, purchase_price: 0, color: "#5BAAEC" });
  const [aiText, setAiText] = useState("");
  const [aiParsing, setAiParsing] = useState(false);
  const [suggestions, setSuggestions] = useState<typeof POPULAR_SYMBOLS>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Handlers for AI parsing and suggestions
  const handleAIParse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiText.trim()) return;
    try {
      setAiParsing(true);
      setErrorMsg("");
      const parsed = await parseAssetWithAI(aiText);
      if (parsed.symbol) {
        setAssetForm({
          symbol: parsed.symbol,
          name: parsed.name,
          type: parsed.type,
          quantity: parsed.quantity,
          purchase_price: parsed.purchase_price,
          color: parsed.color,
        });
        setModalMode("manual"); // Switch to manual to review and edit
      } else {
        setErrorMsg("AI không nhận diện được tài sản này. Hãy nhập thủ công hoặc mô tả rõ hơn.");
      }
    } catch (err: any) {
      console.error("AI parsing failed:", err);
      setErrorMsg(err.message || "Lỗi AI phân tích tài sản.");
    } finally {
      setAiParsing(false);
    }
  };

  const handleSymbolChange = async (val: string) => {
    const symbol = val.toUpperCase();
    setAssetForm(prev => ({ ...prev, symbol }));
    
    if (symbol.trim()) {
      const filtered = POPULAR_SYMBOLS.filter(item => 
        item.symbol.includes(symbol) || item.name.toLowerCase().includes(symbol.toLowerCase())
      );
      setSuggestions(filtered);
      setShowSuggestions(true);
      
      // Auto-prefill if matches exactly
      const exactMatch = POPULAR_SYMBOLS.find(item => item.symbol === symbol);
      if (exactMatch) {
        setAssetForm(prev => ({
          ...prev,
          name: exactMatch.name,
          type: exactMatch.type,
          color: exactMatch.color
        }));
        try {
          const res = await getMarketPrice(symbol);
          if (res && res.price > 0) {
            setAssetForm(prev => ({ ...prev, purchase_price: res.price }));
          }
        } catch (e) {
          console.error("Prefill price failed:", e);
        }
      }
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSelectSuggestion = async (item: typeof POPULAR_SYMBOLS[0]) => {
    setAssetForm(prev => ({
      ...prev,
      symbol: item.symbol,
      name: item.name,
      type: item.type,
      color: item.color
    }));
    setShowSuggestions(false);
    try {
      const res = await getMarketPrice(item.symbol);
      if (res && res.price > 0) {
        setAssetForm(prev => ({ ...prev, purchase_price: res.price }));
      }
    } catch (e) {
      console.error("Prefill price failed:", e);
    }
  };

  // Fetch functions
  const fetchProfile = async () => {
    try {
      setLoadingProfile(true);
      const data = await getInvestmentProfile();
      setProfile(data);
      setProfileForm({
        risk_appetite: data.risk_appetite,
        capital: data.capital,
        goal: data.goal,
      });
    } catch (err) {
      console.error("Error fetching investment profile:", err);
    } finally {
      setLoadingProfile(false);
    }
  };

  const fetchPortfolio = async () => {
    try {
      setLoadingPortfolio(true);
      const data = await getPortfolio();
      setPortfolioAssets(data);
    } catch (err) {
      console.error("Error fetching portfolio:", err);
    } finally {
      setLoadingPortfolio(false);
    }
  };

  const runStressTest = async () => {
    try {
      setLoadingStress(true);
      setErrorMsg("");
      const data = await getStressTest();
      setStressResult(data);
    } catch (err: any) {
      console.error("Error running stress test:", err);
      setErrorMsg(err.message || "Không thể chạy Stress Test lúc này.");
    } finally {
      setLoadingStress(false);
    }
  };

  useEffect(() => {
    fetchProfile();
    fetchPortfolio();
  }, []);

  // Handlers
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const updated = await saveInvestmentProfile(profileForm);
      setProfile(updated);
      setShowProfileModal(false);
      // Refresh stress test if it was loaded
      if (stressResult) runStressTest();
    } catch (err: any) {
      setErrorMsg(err.message || "Lỗi lưu thông tin profile.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await addAsset(assetForm);
      await fetchPortfolio();
      setShowAssetModal(false);
      setAssetForm({ symbol: "", name: "", type: "stock", quantity: 1, purchase_price: 0, color: "#5BAAEC" });
      // Refresh stress test if it was loaded
      if (stressResult) runStressTest();
    } catch (err: any) {
      setErrorMsg(err.message || "Lỗi thêm tài sản đầu tư.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAsset = async (assetId: string) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa tài sản này khỏi danh mục?")) return;
    try {
      await deleteAsset(assetId);
      await fetchPortfolio();
      // Refresh stress test if it was loaded
      if (stressResult) runStressTest();
    } catch (err) {
      alert("Lỗi khi xóa tài sản.");
    }
  };

  // Calculations
  const currentPortfolioValue = portfolioAssets.reduce((sum, item) => sum + (item.value || 0), 0);
  const totalCapital = profile?.capital || 0;
  const idleCash = Math.max(0, totalCapital - currentPortfolioValue);
  const totalProfit = portfolioAssets.reduce((sum, item) => sum + (item.profit || 0), 0);
  const totalInvested = portfolioAssets.reduce((sum, item) => sum + (item.quantity * item.purchase_price), 0);
  const portfolioProfitPercent = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0;

  // Assets mapped for the pie chart
  const pieData = portfolioAssets.map(item => ({
    name: item.name,
    value: item.value || 0,
    allocation: currentPortfolioValue > 0 ? Math.round(((item.value || 0) / currentPortfolioValue) * 100) : 0,
    color: item.color || "#5BAAEC"
  }));

  // Simple mock history curve ending at currentPortfolioValue
  const portfolioHistory = [
    { month: "T12/25", value: currentPortfolioValue * 0.85 },
    { month: "T1/26", value: currentPortfolioValue * 0.88 },
    { month: "T2/26", value: currentPortfolioValue * 0.90 },
    { month: "T3/26", value: currentPortfolioValue * 0.94 },
    { month: "T4/26", value: currentPortfolioValue * 0.98 },
    { month: "T5/26", value: currentPortfolioValue },
  ];

  return (
    <div className="space-y-xxl">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-md">
        <div>
          <h1 className="font-heading text-h2-kpi text-stitch-on-surface">Quản Lý Đầu Tư & AI Stress-Test</h1>
          <p className="text-body-lg text-stitch-on-surface-variant mt-1 flex items-center gap-2">
            Hồ sơ rủi ro:&nbsp;
            {loadingProfile ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <span className={`px-3 py-1 rounded-full text-label-caps font-bold ${riskClasses[profile?.risk_appetite as keyof typeof riskClasses || "moderate"]}`}>
                {riskLabels[profile?.risk_appetite as keyof typeof riskLabels || "moderate"]}
              </span>
            )}
          </p>
        </div>
        
        {/* Navigation & Controls */}
        <div className="flex items-center gap-sm">
          <div className="bg-stitch-surface-container rounded-lg p-0.5 border border-stitch-outline-variant/60 flex">
            <button
              onClick={() => setActiveTab("portfolio")}
              className={`px-4 py-2 rounded-md text-sm font-semibold transition-all ${
                activeTab === "portfolio"
                  ? "bg-white text-stitch-on-surface shadow-sm"
                  : "text-stitch-on-surface-variant hover:text-stitch-on-surface"
              }`}
            >
              Danh Mục & Tài Sản
            </button>
            <button
              onClick={() => {
                setActiveTab("stresstest");
                if (!stressResult) runStressTest();
              }}
              className={`px-4 py-2 rounded-md text-sm font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === "stresstest"
                  ? "bg-white text-stitch-on-surface shadow-sm"
                  : "text-stitch-on-surface-variant hover:text-stitch-on-surface"
              }`}
            >
              <Activity className="w-4 h-4 text-stitch-primary-container" />
              AI Stress-Test
            </button>
          </div>

          <button
            onClick={() => setShowProfileModal(true)}
            className="btn-outline p-2.5 rounded-lg flex items-center justify-center border-stitch-outline-variant/60 hover:bg-stitch-surface-container"
            title="Cài đặt profile đầu tư"
          >
            <Settings className="w-4 h-4 text-stitch-on-surface-variant" />
          </button>
        </div>
      </div>

      {activeTab === "portfolio" ? (
        <>
          {/* KPI Dashboard */}
          <section className="grid grid-cols-1 md:grid-cols-4 gap-lg">
            <div className="stitch-card p-lg">
              <p className="text-body-sm text-stitch-on-surface-variant font-medium">Tổng vốn đầu tư đăng ký</p>
              <h2 className="font-heading text-h2-kpi text-stitch-on-surface mt-xs">
                {loadingProfile ? <Loader2 className="w-6 h-6 animate-spin mt-2" /> : formatCurrency(totalCapital)}
              </h2>
              <p className="text-body-xs text-stitch-on-surface-variant mt-3 truncate">
                Mục tiêu: {profile?.goal || "Chưa thiết lập"}
              </p>
            </div>
            
            <div className="stitch-card p-lg">
              <p className="text-body-sm text-stitch-on-surface-variant font-medium">Giá trị danh mục thực tế</p>
              <h2 className="font-heading text-h2-kpi text-stitch-on-surface mt-xs">
                {loadingPortfolio ? <Loader2 className="w-6 h-6 animate-spin mt-2" /> : formatCurrency(currentPortfolioValue)}
              </h2>
              <div className={`mt-3 flex items-center gap-1 text-label-caps font-bold ${totalProfit >= 0 ? "text-success" : "text-danger"}`}>
                {totalProfit >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                <span>{portfolioProfitPercent >= 0 ? "+" : ""}{formatPercent(portfolioProfitPercent)}</span>
              </div>
            </div>
            
            <div className="stitch-card p-lg">
              <p className="text-body-sm text-stitch-on-surface-variant font-medium">Lợi nhuận tạm tính (P/L)</p>
              <h2 className={`font-heading text-h2-kpi mt-xs ${totalProfit >= 0 ? "text-success" : "text-danger"}`}>
                {loadingPortfolio ? <Loader2 className="w-6 h-6 animate-spin mt-2" /> : `${totalProfit >= 0 ? "+" : ""}${formatCurrency(totalProfit)}`}
              </h2>
              <p className="text-body-sm text-stitch-on-surface-variant mt-3">Đã phản ánh giá thị trường</p>
            </div>
            
            <div className="stitch-card p-lg">
              <p className="text-body-sm text-stitch-on-surface-variant font-medium">Vốn khả dụng / Tiền nhàn rỗi</p>
              <h2 className="font-heading text-h2-kpi text-stitch-primary-container mt-xs">
                {loadingProfile || loadingPortfolio ? <Loader2 className="w-6 h-6 animate-spin mt-2" /> : formatCurrency(idleCash)}
              </h2>
              <div className="mt-3 flex items-center gap-1 text-label-caps text-stitch-primary-container font-semibold">
                <Zap className="w-4 h-4" />
                <span>Sẵn sàng phân bổ</span>
              </div>
            </div>
          </section>

          {/* Charts Section */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-xl">
            {/* Growth Curve */}
            <div className="stitch-card p-lg">
              <h3 className="section-title mb-lg">Ước Tính Tăng Trưởng Danh Mục</h3>
              <div className="h-[220px]">
                {loadingPortfolio ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-stitch-primary-container" />
                  </div>
                ) : portfolioAssets.length === 0 ? (
                  <div className="w-full h-full flex items-center justify-center text-stitch-on-surface-variant text-sm">
                    Thêm tài sản để theo dõi biểu đồ tăng trưởng
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={portfolioHistory} margin={{ top: 10, right: 5, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="portGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#5BAAEC" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#5BAAEC" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#404750" }} axisLine={false} tickLine={false} />
                      <YAxis hide />
                      <Tooltip formatter={(v: any) => [formatCurrency(Number(v)), "Giá trị"]} />
                      <Area type="monotone" dataKey="value" stroke="#5BAAEC" strokeWidth={2.5} fill="url(#portGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Allocation Chart */}
            <div className="stitch-card p-lg">
              <h3 className="section-title mb-lg">Phân Bổ Loại Tài Sản</h3>
              {loadingPortfolio ? (
                <div className="h-[220px] w-full flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-stitch-primary-container" />
                </div>
              ) : portfolioAssets.length === 0 ? (
                <div className="h-[220px] w-full flex items-center justify-center text-stitch-on-surface-variant text-sm">
                  Chưa có dữ liệu phân bổ tài sản.
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center justify-around h-[220px]">
                  <div className="relative">
                    <ResponsiveContainer width={180} height={180}>
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex items-center justify-center flex-col">
                      <span className="text-body-sm text-stitch-on-surface-variant">Danh mục</span>
                      <span className="font-heading text-base font-bold">100%</span>
                    </div>
                  </div>
                  <div className="space-y-2 mt-4 sm:mt-0 max-h-[180px] overflow-y-auto w-full sm:w-auto px-4 flex-1">
                    {pieData.map((entry, index) => (
                      <div key={index} className="flex items-center gap-2.5 text-sm">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
                        <span className="text-body-sm text-stitch-on-surface-variant truncate flex-1">{entry.name}</span>
                        <span className="font-semibold">{entry.allocation}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Portfolio Asset List */}
          <div className="stitch-card p-lg">
            <div className="flex justify-between items-center mb-lg">
              <h3 className="section-title">Danh Sách Tài Sản</h3>
              <button onClick={() => { setShowAssetModal(true); setModalMode("ai"); setAiText(""); setErrorMsg(""); }} className="btn-primary flex items-center gap-1 text-sm py-2">
                <Plus className="w-4 h-4" />
                Thêm tài sản
              </button>
            </div>
            
            {loadingPortfolio ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-stitch-primary-container" />
              </div>
            ) : portfolioAssets.length === 0 ? (
              <div className="py-12 text-center text-stitch-on-surface-variant">
                <Coins className="w-12 h-12 mx-auto text-stitch-outline-variant mb-3" />
                <p className="text-base font-medium">Danh mục trống</p>
                <p className="text-body-sm mt-1">Hãy nhấp "Thêm tài sản" để nhập danh mục đầu tư của bạn.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-stitch-outline-variant/60 text-stitch-on-surface-variant text-sm font-semibold">
                      <th className="py-3 px-2">Tên / Mã</th>
                      <th className="py-3 px-2">Phân loại</th>
                      <th className="py-3 px-2 text-right">Số lượng</th>
                      <th className="py-3 px-2 text-right">Giá mua</th>
                      <th className="py-3 px-2 text-right">Giá thị trường</th>
                      <th className="py-3 px-2 text-right">Giá trị</th>
                      <th className="py-3 px-2 text-right">Lời/Lỗ</th>
                      <th className="py-3 px-2 text-center">Hành động</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stitch-outline-variant/40">
                    {portfolioAssets.map((asset) => {
                      const profit = asset.profit || 0;
                      const isUp = profit >= 0;
                      return (
                        <tr key={asset.id} className="hover:bg-stitch-surface-container/30 transition-colors text-sm">
                          <td className="py-3.5 px-2">
                            <div className="flex items-center gap-2">
                              <span className="w-7 h-7 rounded text-xs font-bold text-white flex items-center justify-center flex-shrink-0" style={{ backgroundColor: asset.color }}>
                                {asset.symbol.slice(0, 3)}
                              </span>
                              <div>
                                <span className="font-semibold block text-stitch-on-surface">{asset.symbol}</span>
                                <span className="text-xs text-stitch-on-surface-variant block max-w-[150px] truncate">{asset.name}</span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-2 capitalize text-stitch-on-surface-variant">
                            {asset.type === "stock" ? "Cổ phiếu" : asset.type === "gold" ? "Vàng" : asset.type === "saving" ? "Tiết kiệm" : "Crypto"}
                          </td>
                          <td className="py-3.5 px-2 text-right font-medium">{asset.quantity.toLocaleString()}</td>
                          <td className="py-3.5 px-2 text-right tabular-nums">{formatCurrency(asset.purchase_price)}</td>
                          <td className="py-3.5 px-2 text-right tabular-nums text-stitch-on-surface font-medium">{formatCurrency(asset.current_price || asset.purchase_price)}</td>
                          <td className="py-3.5 px-2 text-right font-semibold tabular-nums">{formatCurrency(asset.value || 0)}</td>
                          <td className={`py-3.5 px-2 text-right font-bold tabular-nums ${isUp ? "text-success" : "text-danger"}`}>
                            <span className="block">{isUp ? "+" : ""}{formatCurrency(profit)}</span>
                            <span className="text-xs font-semibold block">{isUp ? "+" : ""}{formatPercent(asset.profit_percent || 0)}</span>
                          </td>
                          <td className="py-3.5 px-2 text-center">
                            <button
                              onClick={() => handleDeleteAsset(asset.id)}
                              className="p-1.5 text-stitch-on-surface-variant hover:text-danger rounded hover:bg-red-50 transition-all"
                              title="Xóa tài sản"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Stress Test AI View */
        <div className="space-y-xl">
          {loadingStress ? (
            <div className="stitch-card p-xl py-24 text-center">
              <Loader2 className="w-12 h-12 animate-spin text-stitch-primary-container mx-auto mb-4" />
              <h4 className="font-heading text-lg font-bold text-stitch-on-surface">Đang phân tích rủi ro hệ thống...</h4>
              <p className="text-body-sm text-stitch-on-surface-variant mt-2 max-w-md mx-auto">
                AI đang chạy giả lập các cú sốc kinh tế (Lạm phát, Suy thoái, Sụp đổ crypto) trên toàn bộ danh mục của bạn và tính toán các phương án phòng vệ rủi ro.
              </p>
            </div>
          ) : (
            <>
              {/* Stress Overview Panel */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-lg">
                {/* Vulnerability Index Gauge */}
                <div className="stitch-card p-lg flex flex-col justify-between">
                  <div>
                    <h4 className="font-heading text-base font-bold text-stitch-on-surface">Chỉ số Tổn hại Rủi ro (Vulnerability)</h4>
                    <p className="text-body-xs text-stitch-on-surface-variant mt-1">Mức độ thiệt hại lớn nhất danh mục có thể phải gánh chịu</p>
                  </div>
                  
                  <div className="my-6 text-center">
                    <div className="inline-block relative">
                      <span className="text-5xl font-extrabold font-heading text-stitch-on-surface">
                        {stressResult?.vulnerability_score.toFixed(1)}%
                      </span>
                      <span className="block text-body-sm font-bold mt-2 capitalize text-stitch-on-surface-variant">
                        Mức rủi ro: {
                          (stressResult?.vulnerability_score || 0) < 15
                            ? "Thấp 🟢"
                            : (stressResult?.vulnerability_score || 0) < 35
                            ? "Trung bình 🟡"
                            : "Cao 🔴"
                        }
                      </span>
                    </div>
                  </div>
                  
                  {/* Gauge Bar */}
                  <div className="w-full bg-stitch-surface-container rounded-full h-3.5 border border-stitch-outline-variant/60 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-1000 ${
                        (stressResult?.vulnerability_score || 0) < 15
                          ? "bg-success"
                          : (stressResult?.vulnerability_score || 0) < 35
                          ? "bg-amber-500"
                          : "bg-danger"
                      }`}
                      style={{ width: `${stressResult?.vulnerability_score || 0}%` }}
                    />
                  </div>
                </div>

                {/* Worst Case Scenario */}
                <div className="stitch-card p-lg flex flex-col justify-between">
                  <div>
                    <h4 className="font-heading text-base font-bold text-stitch-on-surface">Kịch Bản Tồi Nhất (Worst-Case)</h4>
                    <p className="text-body-xs text-stitch-on-surface-variant mt-1">Sự kiện tác động tiêu cực nhất đến tài sản của bạn</p>
                  </div>
                  
                  <div className="my-6">
                    <h3 className="font-heading text-lg font-bold text-danger flex items-center gap-1.5">
                      <TrendingDown className="w-6 h-6 flex-shrink-0" />
                      {stressResult?.worst_scenario}
                    </h3>
                    <div className="mt-3 flex justify-between items-center text-sm border-t border-stitch-outline-variant/40 pt-3">
                      <span className="text-stitch-on-surface-variant">Biến động tài sản dự báo</span>
                      <span className="font-bold text-danger font-heading">{stressResult?.worst_loss_percent.toFixed(2)}%</span>
                    </div>
                  </div>

                  <button
                    onClick={runStressTest}
                    className="btn-outline w-full text-sm font-semibold flex items-center justify-center gap-1.5"
                  >
                    <Activity className="w-4 h-4 text-stitch-primary-container" />
                    Chạy lại giả lập
                  </button>
                </div>

                {/* Diversification Index */}
                <div className="stitch-card p-lg flex flex-col justify-between">
                  <div>
                    <h4 className="font-heading text-base font-bold text-stitch-on-surface">Chỉ Số Đa Dạng Hóa Danh Mục</h4>
                    <p className="text-body-xs text-stitch-on-surface-variant mt-1">Tỷ lệ cân đối tài sản để phòng ngừa biến động thị trường</p>
                  </div>
                  
                  <div className="my-6 text-center">
                    <span className="text-5xl font-extrabold font-heading text-stitch-primary-container">
                      {stressResult?.diversification_score.toFixed(1)}/100
                    </span>
                    <span className="block text-body-sm font-bold mt-2 text-stitch-on-surface-variant">
                      Chất lượng phân bổ: {
                        (stressResult?.diversification_score || 0) > 70
                          ? "Tuyệt vời 🚀"
                          : (stressResult?.diversification_score || 0) > 40
                          ? "Khá tốt 👍"
                          : "Cần cải thiện ⚠️"
                      }
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <div className="flex-1 text-center py-2 bg-stitch-surface-container rounded border border-stitch-outline-variant/60">
                      <span className="block text-xs text-stitch-on-surface-variant">Tài sản</span>
                      <span className="font-bold text-sm">{portfolioAssets.length} loại</span>
                    </div>
                    <div className="flex-1 text-center py-2 bg-stitch-surface-container rounded border border-stitch-outline-variant/60">
                      <span className="block text-xs text-stitch-on-surface-variant">Tiền mặt</span>
                      <span className="font-bold text-sm">{formatPercent(totalCapital > 0 ? (idleCash / totalCapital) * 100 : 0)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stress Comparison Chart */}
              <div className="stitch-card p-lg">
                <h3 className="section-title mb-lg">So Sánh Giá Trị Danh Mục Dưới Các Cú Sốc</h3>
                <div className="h-[250px]">
                  {stressResult?.scenarios && (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stressResult.scenarios} margin={{ top: 10, right: 5, left: 10, bottom: 5 }}>
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#404750" }} tickLine={false} axisLine={false} />
                        <YAxis tickFormatter={(v) => `${(v / 1000000).toFixed(0)}tr`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                        <Tooltip formatter={(v: any) => [formatCurrency(Number(v)), "Giá trị mô phỏng"]} />
                        <Bar dataKey="simulated_value" radius={[6, 6, 0, 0]}>
                          {stressResult.scenarios.map((entry, index) => {
                            const isLoss = entry.loss_value < 0;
                            return (
                              <BarCell
                                key={`cell-${index}`}
                                fill={isLoss ? "#EF4444" : "#10B981"}
                                opacity={entry.id === stressResult.worst_scenario ? 1 : 0.75}
                              />
                            );
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* AI Analysis and Hedging */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-xl">
                {/* AI Analysis Text */}
                <div className="stitch-card p-lg lg:col-span-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-lg">
                      <div className="p-2 bg-stitch-surface-container text-stitch-primary-container rounded-lg border border-stitch-outline-variant/60">
                        <Activity className="w-5 h-5 animate-pulse" />
                      </div>
                      <h3 className="section-title">Nhận Định Rủi Ro Từ AI</h3>
                    </div>
                    <div className="text-body-sm text-stitch-on-surface-variant leading-relaxed space-y-4">
                      {stressResult?.overall_analysis.split("\n\n").map((para, idx) => (
                        <p key={idx}>{para}</p>
                      ))}
                    </div>
                  </div>
                </div>

                {/* AI Hedging Suggestions */}
                <div className="stitch-card p-lg lg:col-span-2">
                  <div className="flex items-center gap-2 mb-lg">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <h3 className="section-title">Chi Chiến Lược Phòng Vệ & Rebalance Đề Xuất</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
                    {stressResult?.hedging_strategies && stressResult.hedging_strategies.length > 0 ? (
                      stressResult.hedging_strategies.map((sug, idx) => {
                        const isReallocate = sug.action === "Tái phân bổ" || sug.action === "Giảm tỷ trọng";
                        const IconComponent = isReallocate ? ShieldCheck : Zap;
                        return (
                          <div key={idx} className="bg-stitch-surface-container rounded-xl p-lg border border-stitch-outline-variant/40 flex flex-col justify-between h-full">
                            <div>
                              <div className="flex justify-between items-start mb-4">
                                <span className={`px-2.5 py-1 rounded-full text-label-caps font-bold text-xs ${
                                  isReallocate
                                    ? "bg-amber-50 text-amber-700 border border-amber-200"
                                    : "bg-green-50 text-green-700 border border-green-200"
                                }`}>
                                  {sug.action}
                                </span>
                                <IconComponent className={`w-5 h-5 ${isReallocate ? "text-amber-500" : "text-green-500"}`} />
                              </div>
                              <h4 className="font-heading text-base font-bold text-stitch-on-surface mb-2">{sug.asset}</h4>
                              <p className="text-body-sm text-stitch-on-surface-variant leading-relaxed mb-4">{sug.reasoning}</p>
                            </div>
                            
                            {sug.amount > 0 && (
                              <div className="flex justify-between items-center pt-3 border-t border-stitch-outline-variant/40 mt-auto">
                                <span className="text-body-sm text-stitch-on-surface-variant">Vốn đề xuất phân bổ</span>
                                <span className="font-heading font-bold text-base text-stitch-primary-container">{formatCurrency(sug.amount)}</span>
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="col-span-2 text-center py-12 text-stitch-on-surface-variant text-sm">
                        AI chưa phát hiện điểm yếu nghiêm trọng cần rebalance khẩn cấp.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* --- MODALS --- */}
      
      {/* Profile settings modal */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-stitch-outline-variant/60 max-w-md w-full p-lg space-y-lg animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center">
              <h3 className="font-heading text-lg font-bold text-stitch-on-surface">Cấu Hình Hồ Sơ Đầu Tư</h3>
              <button onClick={() => setShowProfileModal(false)} className="text-stitch-on-surface-variant hover:text-stitch-on-surface font-semibold text-sm">Đóng</button>
            </div>
            
            <form onSubmit={handleSaveProfile} className="space-y-4">
              {errorMsg && <p className="text-danger text-sm bg-red-50 p-2 rounded border border-red-200">{errorMsg}</p>}
              
              <div className="space-y-2">
                <label className="text-sm font-semibold text-stitch-on-surface">Khẩu vị rủi ro</label>
                <select
                  value={profileForm.risk_appetite}
                  onChange={(e) => setProfileForm({ ...profileForm, risk_appetite: e.target.value })}
                  className="w-full bg-stitch-surface-container rounded-lg p-2.5 border border-stitch-outline-variant/60 text-sm focus:outline-none focus:ring-2 focus:ring-stitch-primary-container"
                >
                  <option value="conservative">Thận trọng (Bảo toàn vốn, ưu tiên tiết kiệm/vàng)</option>
                  <option value="moderate">Trung bình (Cân bằng rủi ro, kết hợp cổ phiếu/tiết kiệm)</option>
                  <option value="aggressive">Tăng trưởng (Chấp nhận rủi ro lớn, ưu tiên cổ phiếu/crypto)</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-stitch-on-surface">Tổng vốn có thể đầu tư (VND)</label>
                <input
                  type="number"
                  required
                  min="0"
                  value={profileForm.capital || ""}
                  onChange={(e) => setProfileForm({ ...profileForm, capital: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-stitch-surface-container rounded-lg p-2.5 border border-stitch-outline-variant/60 text-sm focus:outline-none focus:ring-2 focus:ring-stitch-primary-container"
                  placeholder="Ví dụ: 200000000"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-stitch-on-surface">Mục tiêu tài chính</label>
                <input
                  type="text"
                  required
                  value={profileForm.goal}
                  onChange={(e) => setProfileForm({ ...profileForm, goal: e.target.value })}
                  className="w-full bg-stitch-surface-container rounded-lg p-2.5 border border-stitch-outline-variant/60 text-sm focus:outline-none focus:ring-2 focus:ring-stitch-primary-container"
                  placeholder="Ví dụ: Đạt tự do tài chính tuổi 35 hoặc Mua nhà"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="btn-primary w-full py-2.5 flex items-center justify-center gap-2 mt-4"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Lưu cấu hình
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Add Asset Modal */}
      {showAssetModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-stitch-outline-variant/60 max-w-md w-full p-lg space-y-lg animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center">
              <h3 className="font-heading text-lg font-bold text-stitch-on-surface">Thêm Tài Sản Vào Danh Mục</h3>
              <button onClick={() => setShowAssetModal(false)} className="text-stitch-on-surface-variant hover:text-stitch-on-surface font-semibold text-sm">Đóng</button>
            </div>
            
            {/* Modal Mode Selector */}
            <div className="flex border-b border-stitch-outline-variant/60 pb-2 gap-4">
              <button
                type="button"
                onClick={() => { setModalMode("ai"); setErrorMsg(""); }}
                className={`flex-1 pb-1.5 text-sm font-semibold text-center transition-all ${
                  modalMode === "ai"
                    ? "border-b-2 border-stitch-primary-container text-stitch-primary-container font-bold"
                    : "text-stitch-on-surface-variant hover:text-stitch-on-surface"
                }`}
              >
                🤖 Trợ lý AI (Quick-Add)
              </button>
              <button
                type="button"
                onClick={() => { setModalMode("manual"); setErrorMsg(""); }}
                className={`flex-1 pb-1.5 text-sm font-semibold text-center transition-all ${
                  modalMode === "manual"
                    ? "border-b-2 border-stitch-primary-container text-stitch-primary-container font-bold"
                    : "text-stitch-on-surface-variant hover:text-stitch-on-surface"
                }`}
              >
                ✏️ Nhập thủ công
              </button>
            </div>

            {modalMode === "ai" ? (
              <form onSubmit={handleAIParse} className="space-y-4">
                {errorMsg && <p className="text-danger text-sm bg-red-50 p-2 rounded border border-red-200">{errorMsg}</p>}
                
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-stitch-on-surface block">Mô tả giao dịch bằng ngôn ngữ tự nhiên</label>
                  <textarea
                    rows={4}
                    required
                    value={aiText}
                    onChange={(e) => setAiText(e.target.value)}
                    placeholder="Ví dụ:
- Tôi mới mua 200 cổ phiếu FPT giá 135k
- Vừa mua thêm 2 lượng vàng SJC giá 82 triệu
- Gửi tiết kiệm 50 triệu ngân hàng Vietcombank
- Đang nắm giữ 0.05 BTC mua giá 67000 USD"
                    className="w-full bg-stitch-surface-container rounded-lg p-2.5 border border-stitch-outline-variant/60 text-sm focus:outline-none focus:ring-2 focus:ring-stitch-primary-container"
                  />
                  <p className="text-xs text-stitch-on-surface-variant leading-relaxed">
                    AI sẽ tự động phân tích: Mã tài sản, Số lượng, Loại tài sản, Giá mua quy đổi sang VND và chọn màu sắc phù hợp.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={aiParsing || !aiText.trim()}
                  className="btn-primary w-full py-2.5 flex items-center justify-center gap-2 mt-4"
                >
                  {aiParsing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Đang phân tích bằng Gemini...
                    </>
                  ) : (
                    "Phân tích bằng AI"
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handleAddAsset} className="space-y-4">
                {errorMsg && <p className="text-danger text-sm bg-red-50 p-2 rounded border border-red-200">{errorMsg}</p>}
                
                <div className="grid grid-cols-2 gap-md">
                  {/* Symbol with Autocomplete */}
                  <div className="space-y-2 relative">
                    <label className="text-sm font-semibold text-stitch-on-surface block">Mã tài sản (Symbol)</label>
                    <input
                      type="text"
                      required
                      value={assetForm.symbol}
                      onChange={(e) => handleSymbolChange(e.target.value)}
                      onFocus={() => {
                        if (assetForm.symbol.trim()) setShowSuggestions(true);
                      }}
                      onBlur={() => {
                        // Allow click to register
                        setTimeout(() => setShowSuggestions(false), 200);
                      }}
                      className="w-full bg-stitch-surface-container rounded-lg p-2.5 border border-stitch-outline-variant/60 text-sm focus:outline-none focus:ring-2 focus:ring-stitch-primary-container"
                      placeholder="Ví dụ: FPT, GOLD, BTC"
                      autoComplete="off"
                    />
                    {showSuggestions && suggestions.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-stitch-outline-variant/60 rounded-lg shadow-lg z-50 max-h-[160px] overflow-y-auto">
                        {suggestions.map((item) => (
                          <button
                            key={item.symbol}
                            type="button"
                            onMouseDown={() => handleSelectSuggestion(item)}
                            className="w-full text-left px-3 py-2 hover:bg-stitch-surface-container flex items-center justify-between text-sm transition-colors"
                          >
                            <div>
                              <span className="font-bold text-stitch-on-surface">{item.symbol}</span>
                              <span className="text-xs text-stitch-on-surface-variant ml-2">({item.name})</span>
                            </div>
                            <span className="text-xs px-2 py-0.5 rounded bg-stitch-primary-container/10 text-brand-blue-dark uppercase">
                              {item.type}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-stitch-on-surface block">Phân loại</label>
                    <select
                      value={assetForm.type}
                      onChange={(e) => setAssetForm({ ...assetForm, type: e.target.value })}
                      className="w-full bg-stitch-surface-container rounded-lg p-2.5 border border-stitch-outline-variant/60 text-sm focus:outline-none focus:ring-2 focus:ring-stitch-primary-container"
                    >
                      <option value="stock">Cổ phiếu (Vietnam)</option>
                      <option value="gold">Vàng (SJC)</option>
                      <option value="saving">Gửi tiết kiệm</option>
                      <option value="crypto">Tiền mã hóa (Binance)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-stitch-on-surface block">Tên hiển thị</label>
                  <input
                    type="text"
                    required
                    value={assetForm.name}
                    onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })}
                    className="w-full bg-stitch-surface-container rounded-lg p-2.5 border border-stitch-outline-variant/60 text-sm focus:outline-none focus:ring-2 focus:ring-stitch-primary-container"
                    placeholder="Ví dụ: Cổ phiếu FPT, Vàng SJC Bảo Tín"
                  />
                </div>

                <div className="grid grid-cols-2 gap-md">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-stitch-on-surface block">Số lượng sở hữu</label>
                    <input
                      type="number"
                      required
                      step="any"
                      min="0"
                      value={assetForm.quantity || ""}
                      onChange={(e) => setAssetForm({ ...assetForm, quantity: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-stitch-surface-container rounded-lg p-2.5 border border-stitch-outline-variant/60 text-sm focus:outline-none focus:ring-2 focus:ring-stitch-primary-container"
                      placeholder="Ví dụ: 1000"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-stitch-on-surface block">Giá mua trung bình (VND)</label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={assetForm.purchase_price || ""}
                      onChange={(e) => setAssetForm({ ...assetForm, purchase_price: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-stitch-surface-container rounded-lg p-2.5 border border-stitch-outline-variant/60 text-sm focus:outline-none focus:ring-2 focus:ring-stitch-primary-container"
                      placeholder="Ví dụ: 72000"
                    />
                    {assetForm.purchase_price > 0 && (
                      <div className="mt-1.5 text-xs text-stitch-on-surface-variant flex flex-col gap-1 border-t border-stitch-outline-variant/30 pt-1">
                        <span>Định dạng hiển thị: <strong className="text-stitch-primary-container">{formatCurrency(assetForm.purchase_price)}</strong></span>
                        {(() => {
                          if (assetForm.type === "gold") {
                            const p = assetForm.purchase_price;
                            let suggested = p;
                            if (p < 10) suggested = p * 10000000;
                            else if (p < 100) suggested = p * 1000000;
                            else if (p < 1000) suggested = p * 100000;
                            else if (p < 100000) suggested = p * 1000;
                            else if (p < 15000000) suggested = p * 10;
                            
                            if (suggested !== p) {
                              return (
                                <span className="text-amber-600 font-semibold bg-amber-50 p-1 rounded border border-amber-200 mt-0.5">
                                  ⚠️ Hệ thống sẽ tự động sửa thành {formatCurrency(suggested)}/lượng.
                                </span>
                              );
                            }
                          }
                          if (assetForm.type === "stock" && assetForm.purchase_price < 1000) {
                            return (
                              <span className="text-amber-600 font-semibold bg-amber-50 p-1 rounded border border-amber-200 mt-0.5">
                                ⚠️ Hệ thống sẽ tự động nhân 1.000 thành {formatCurrency(assetForm.purchase_price * 1000)}.
                              </span>
                            );
                          }
                          if (assetForm.type === "crypto" && assetForm.symbol === "BTC" && assetForm.purchase_price < 150000) {
                            return (
                              <span className="text-amber-600 font-semibold bg-amber-50 p-1 rounded border border-amber-200 mt-0.5">
                                ⚠️ Giá BTC dạng USD, hệ thống tự động đổi sang VND (~{formatCurrency(assetForm.purchase_price * 25400)}).
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-stitch-on-surface block">Màu sắc biểu đồ</label>
                  <select
                    value={assetForm.color}
                    onChange={(e) => setAssetForm({ ...assetForm, color: e.target.value })}
                    className="w-full bg-stitch-surface-container rounded-lg p-2.5 border border-stitch-outline-variant/60 text-sm focus:outline-none focus:ring-2 focus:ring-stitch-primary-container"
                  >
                    <option value="#5BAAEC">Xanh lam</option>
                    <option value="#22C55E">Xanh lục</option>
                    <option value="#F59E0B">Vàng hổ phách</option>
                    <option value="#FB923C">Cam</option>
                    <option value="#A78BFA">Tím</option>
                    <option value="#EC4899">Hồng</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary w-full py-2.5 flex items-center justify-center gap-2 mt-4"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Thêm tài sản
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
