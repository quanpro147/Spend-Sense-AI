import React, { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  Plus,
  Trash2,
  Settings,
  Coins,
  Loader2,
  TrendingUp,
  Award,
  Sparkles,
  RefreshCw,
  HelpCircle,
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
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { formatCurrency, formatPercent, formatNumberToVietnameseWords } from "@/lib/utils";
import {
  getInvestmentProfile,
  saveInvestmentProfile,
  getPortfolio,
  addAsset,
  deleteAsset,
  getRoboAdvisorData,
  parseAssetWithAI,
  getMarketPrice,
  getMarketQuotes,
} from "@/lib/api";
import type {
  InvestmentProfile,
  InvestmentAsset,
  RoboAdvisorData,
  MarketSymbol,
} from "@/lib/api";

const POPULAR_SYMBOLS = [
  // --- Vàng / Tiết kiệm ---
  { symbol: "SJC", name: "Vàng SJC", type: "gold", color: "#F59E0B" },
  { symbol: "GOLD", name: "Vàng SJC", type: "gold", color: "#F59E0B" },
  { symbol: "SAVING", name: "Gửi Tiết Kiệm", type: "saving", color: "#EC4899" },

  // --- Crypto ---
  { symbol: "BTC", name: "Bitcoin", type: "crypto", color: "#FB923C" },
  { symbol: "ETH", name: "Ethereum", type: "crypto", color: "#A78BFA" },
  { symbol: "SOL", name: "Solana", type: "crypto", color: "#5BAAEC" },
  { symbol: "BNB", name: "Binance Coin", type: "crypto", color: "#F59E0B" },
  { symbol: "USDT", name: "Tether USD", type: "crypto", color: "#22C55E" },



  // --- Cổ phiếu: Công nghệ & Viễn thông ---
  { symbol: "FPT", name: "Cổ phiếu FPT", type: "stock", color: "#5BAAEC" },
  { symbol: "CTR", name: "Viettel Construction", type: "stock", color: "#5BAAEC" },
  { symbol: "VGI", name: "Viettel Global", type: "stock", color: "#5BAAEC" },
  { symbol: "CMG", name: "Công nghệ CMC", type: "stock", color: "#5BAAEC" },
  { symbol: "FOX", name: "FPT Telecom", type: "stock", color: "#5BAAEC" },

  // --- Cổ phiếu: Ngân hàng (Banking) ---
  { symbol: "VCB", name: "Ngân hàng Vietcombank", type: "stock", color: "#22C55E" },
  { symbol: "BID", name: "Ngân hàng BIDV", type: "stock", color: "#22C55E" },
  { symbol: "CTG", name: "Ngân hàng VietinBank", type: "stock", color: "#22C55E" },
  { symbol: "TCB", name: "Ngân hàng Techcombank", type: "stock", color: "#22C55E" },
  { symbol: "MBB", name: "Ngân hàng Quân Đội (MB)", type: "stock", color: "#22C55E" },
  { symbol: "VPB", name: "Ngân hàng VPBank", type: "stock", color: "#22C55E" },
  { symbol: "ACB", name: "Ngân hàng Á Châu (ACB)", type: "stock", color: "#22C55E" },
  { symbol: "STB", name: "Ngân hàng Sacombank", type: "stock", color: "#22C55E" },
  { symbol: "HDB", name: "Ngân hàng HDBank", type: "stock", color: "#22C55E" },
  { symbol: "VIB", name: "Ngân hàng VIB", type: "stock", color: "#22C55E" },
  { symbol: "TPB", name: "Ngân hàng TPBank", type: "stock", color: "#22C55E" },
  { symbol: "SHB", name: "Ngân hàng SHB", type: "stock", color: "#22C55E" },
  { symbol: "LPB", name: "Ngân hàng LPBank", type: "stock", color: "#22C55E" },
  { symbol: "MSB", name: "Ngân hàng MSB", type: "stock", color: "#22C55E" },
  { symbol: "OCB", name: "Ngân hàng OCB", type: "stock", color: "#22C55E" },
  { symbol: "SSB", name: "Ngân hàng SeABank", type: "stock", color: "#22C55E" },

  // --- Cổ phiếu: Chứng khoán (Securities) ---
  { symbol: "SSI", name: "Chứng khoán SSI", type: "stock", color: "#FB923C" },
  { symbol: "VND", name: "Chứng khoán VNDIRECT", type: "stock", color: "#FB923C" },
  { symbol: "VCI", name: "Chứng khoán Vietcap", type: "stock", color: "#FB923C" },
  { symbol: "HCM", name: "Chứng khoán TP.HCM (HSC)", type: "stock", color: "#FB923C" },
  { symbol: "MBS", name: "Chứng khoán MB", type: "stock", color: "#FB923C" },
  { symbol: "SHS", name: "Chứng khoán Sài Gòn - Hà Nội", type: "stock", color: "#FB923C" },
  { symbol: "FTS", name: "Chứng khoán FPT", type: "stock", color: "#FB923C" },
  { symbol: "BSI", name: "Chứng khoán BIDV (BSC)", type: "stock", color: "#FB923C" },
  { symbol: "CTS", name: "Chứng khoán Vietinbank (CTS)", type: "stock", color: "#FB923C" },

  // --- Cổ phiếu: Bất động sản, Xây dựng & KCN ---
  { symbol: "VHM", name: "Cổ phiếu Vinhomes", type: "stock", color: "#A78BFA" },
  { symbol: "VIC", name: "Cổ phiếu Vingroup", type: "stock", color: "#A78BFA" },
  { symbol: "VRE", name: "Cổ phiếu Vincom Retail", type: "stock", color: "#A78BFA" },
  { symbol: "NVL", name: "Cổ phiếu Novaland", type: "stock", color: "#A78BFA" },
  { symbol: "PDR", name: "Bất động sản Phát Đạt", type: "stock", color: "#A78BFA" },
  { symbol: "DIG", name: "Tổng Cty Đầu tư Phát triển Xây dựng (DIC)", type: "stock", color: "#A78BFA" },
  { symbol: "DXG", name: "Tập đoàn Đất Xanh", type: "stock", color: "#A78BFA" },
  { symbol: "KBC", name: "Đô thị Kinh Bắc", type: "stock", color: "#A78BFA" },
  { symbol: "NLG", name: "Đầu tư Nam Long", type: "stock", color: "#A78BFA" },
  { symbol: "KDH", name: "Nhà Khang Điền", type: "stock", color: "#A78BFA" },
  { symbol: "BCM", name: "Đầu tư và Phát triển Công nghiệp (Becamex)", type: "stock", color: "#A78BFA" },
  { symbol: "VGC", name: "Tổng Cty VIGLACERA", type: "stock", color: "#A78BFA" },
  { symbol: "REE", name: "Cơ Điện Lạnh (REE)", type: "stock", color: "#A78BFA" },

  // --- Cổ phiếu: Thép & Vật liệu (Steel & Materials) ---
  { symbol: "HPG", name: "Cổ phiếu Hòa Phát", type: "stock", color: "#707881" },
  { symbol: "HSG", name: "Tập đoàn Hoa Sen", type: "stock", color: "#707881" },
  { symbol: "NKG", name: "Thép Nam Kim", type: "stock", color: "#707881" },

  // --- Cổ phiếu: Bán lẻ & Hàng tiêu dùng (Retail & Consumer) ---
  { symbol: "MWG", name: "Thế Giới Di Động", type: "stock", color: "#F59E0B" },
  { symbol: "FRT", name: "Bán lẻ FPT (FPT Shop)", type: "stock", color: "#F59E0B" },
  { symbol: "DGW", name: "Thế Giới Số (Digiworld)", type: "stock", color: "#F59E0B" },
  { symbol: "PNJ", name: "Vàng bạc Đá quý Phú Nhuận", type: "stock", color: "#F59E0B" },
  { symbol: "MSN", name: "Tập đoàn Masan", type: "stock", color: "#F59E0B" },
  { symbol: "VNM", name: "Cổ phiếu Vinamilk", type: "stock", color: "#F59E0B" },
  { symbol: "SAB", name: "Bia Rượu Sabeco", type: "stock", color: "#F59E0B" },

  // --- Cổ phiếu: Dầu khí & Năng lượng (Energy / Oil & Gas) ---
  { symbol: "GAS", name: "Tổng Cty Khí Việt Nam (PV Gas)", type: "stock", color: "#EC4899" },
  { symbol: "PLX", name: "Tập đoàn Xăng dầu Petrolimex", type: "stock", color: "#EC4899" },
  { symbol: "POW", name: "Điện lực Dầu khí Việt Nam (PV Power)", type: "stock", color: "#EC4899" },
  { symbol: "PVD", name: "Khoan Dầu khí PVD", type: "stock", color: "#EC4899" },
  { symbol: "PVS", name: "Dịch vụ Kỹ thuật Dầu khí PVS", type: "stock", color: "#EC4899" },
  { symbol: "PVT", name: "Vận tải Dầu khí PVT", type: "stock", color: "#EC4899" },

  // --- Cổ phiếu: Hóa chất & Nông nghiệp ---
  { symbol: "DGC", name: "Hóa chất Đức Giang", type: "stock", color: "#10B981" },
  { symbol: "DPM", name: "Phân bón Hóa chất Dầu khí (Đạm Phú Mỹ)", type: "stock", color: "#10B981" },
  { symbol: "DCM", name: "Phân bón Dầu khí Cà Mau (Đạm Cà Mau)", type: "stock", color: "#10B981" },
  { symbol: "HAG", name: "Hoàng Anh Gia Lai", type: "stock", color: "#10B981" },
  { symbol: "DBC", name: "Tập đoàn Dabaco", type: "stock", color: "#10B981" },

  // --- Cổ phiếu: Vận tải & Hàng không ---
  { symbol: "VJC", name: "Hàng không Vietjet Air", type: "stock", color: "#06B6D4" },
  { symbol: "HVN", name: "Tổng Cty Hàng không Việt Nam (VNA)", type: "stock", color: "#06B6D4" },
  { symbol: "GMD", name: "Cảng & Logistics Gemadept", type: "stock", color: "#06B6D4" },
  { symbol: "HAH", name: "Vận tải và Xếp dỡ Hải An", type: "stock", color: "#06B6D4" },
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
  const [roboData, setRoboData] = useState<RoboAdvisorData | null>(null);
  const [activeTab, setActiveTab] = useState<"portfolio" | "roboadvisor">("portfolio");
  const [marketQuotes, setMarketQuotes] = useState<MarketSymbol[]>([]);
  
  // Loading states
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingPortfolio, setLoadingPortfolio] = useState(true);
  const [loadingRobo, setLoadingRobo] = useState(false);
  const [loadingQuotes, setLoadingQuotes] = useState(true);

  // Wealth planner slider states
  const [monthlySavingsInput, setMonthlySavingsInput] = useState<number>(2000000);
  const [expectedYieldInput, setExpectedYieldInput] = useState<number>(10);
  const [projectionYearsInput, setProjectionYearsInput] = useState<number>(30);

  // Challenge states
  const [challengeProgress, setChallengeProgress] = useState<Record<string, { current: number; joined: boolean }>>({
    "52_weeks": { current: 0, joined: false },
    "no_bubble_tea": { current: 0, joined: false },
    "blue_chip_accumulation": { current: 0, joined: false },
  });

  
  // Modal states
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [modalMode, setModalMode] = useState<"ai" | "manual">("ai");
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [helpTab, setHelpTab] = useState<"portfolio" | "roboadvisor">("portfolio");
  
  // Form states
  const [profileForm, setProfileForm] = useState({ risk_appetite: "moderate", capital: 0, goal: "" });
  const [assetForm, setAssetForm] = useState({ symbol: "", name: "", type: "stock", quantity: 1, purchase_price: 0, color: "#5BAAEC", interest_rate: 0.0, term_months: 0 });
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
          interest_rate: 0.0,
          term_months: 0,
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

  const fetchRoboData = async () => {
    try {
      setLoadingRobo(true);
      setErrorMsg("");
      const data = await getRoboAdvisorData();
      setRoboData(data);
      
      const savings = data.monthly_income - data.monthly_expenses;
      setMonthlySavingsInput(savings > 0 ? savings : 2000000);
      
      const yieldsByRisk = { conservative: 7, moderate: 10, aggressive: 14 };
      setExpectedYieldInput(yieldsByRisk[data.risk_appetite as keyof typeof yieldsByRisk] || 10);
    } catch (err: any) {
      console.error("Error fetching robo data:", err);
      setErrorMsg(err.message || "Không thể chạy Cố Vấn lúc này.");
    } finally {
      setLoadingRobo(false);
    }
  };

  const fetchMarketQuotes = async () => {
    try {
      setLoadingQuotes(true);
      const data = await getMarketQuotes(["VNINDEX", "VN30", "HNXINDEX", "E1VFVN30", "FUEVFVND", "FUESSVFL"]);
      setMarketQuotes(data);
    } catch (err) {
      console.error("Error fetching market quotes:", err);
    } finally {
      setLoadingQuotes(false);
    }
  };

  useEffect(() => {
    fetchProfile();
    fetchPortfolio();
    fetchMarketQuotes();

    const savedProgress = localStorage.getItem("spendsense_challenge_progress");
    if (savedProgress) {
      try {
        setChallengeProgress(JSON.parse(savedProgress));
      } catch (e) {
        console.error("Error parsing challenge progress:", e);
      }
    }
  }, []);

  const handleJoinChallenge = (challengeId: string) => {
    const updated = {
      ...challengeProgress,
      [challengeId]: { ...(challengeProgress[challengeId] || { current: 0, joined: false }), joined: true }
    };
    setChallengeProgress(updated);
    localStorage.setItem("spendsense_challenge_progress", JSON.stringify(updated));
  };

  const handleDepositChallenge = async (challengeId: string, amount: number, syncToPortfolio: boolean) => {
    const currentProg = challengeProgress[challengeId] || { current: 0, joined: false };
    const newCurrent = currentProg.current + amount;
    const updated = {
      ...challengeProgress,
      [challengeId]: { ...currentProg, current: newCurrent }
    };
    setChallengeProgress(updated);
    localStorage.setItem("spendsense_challenge_progress", JSON.stringify(updated));

    if (syncToPortfolio) {
      try {
        const existingSaving = portfolioAssets.find(a => a.symbol === "SAVING");
        if (existingSaving) {
          await addAsset({
            symbol: "SAVING",
            name: "Gửi Tiết Kiệm",
            type: "saving",
            quantity: existingSaving.quantity + amount,
            purchase_price: 1,
            color: "#EC4899"
          });
        } else {
          await addAsset({
            symbol: "SAVING",
            name: "Gửi Tiết Kiệm",
            type: "saving",
            quantity: amount,
            purchase_price: 1,
            color: "#EC4899"
          });
        }
        await fetchPortfolio();
        if (roboData) fetchRoboData();
      } catch (e) {
        console.error("Failed to sync saving challenge to portfolio:", e);
      }
    }
  };


  // Handlers
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const updated = await saveInvestmentProfile(profileForm);
      setProfile(updated);
      setShowProfileModal(false);
      if (roboData) fetchRoboData();
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
      setAssetForm({ symbol: "", name: "", type: "stock", quantity: 1, purchase_price: 0, color: "#5BAAEC", interest_rate: 0.0, term_months: 0 });
      if (roboData) fetchRoboData();
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
      if (roboData) fetchRoboData();
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

  const calculatedProjectionPoints = React.useMemo(() => {
    if (!roboData) return [];
    const points = [];
    const totalAssets = (roboData.portfolio_value || 0) + (roboData.idle_cash || 0);
    let currentWealth = totalAssets;
    const annualYield = expectedYieldInput / 100;
    const monthlyYield = annualYield / 12;
    
    // Year 0
    points.push({
      year: 0,
      contributions: totalAssets,
      interest: 0,
      total: totalAssets
    });
    
    let totalContributions = totalAssets;
    for (let year = 1; year <= projectionYearsInput; year++) {
      for (let month = 0; month < 12; month++) {
        currentWealth = currentWealth * (1 + monthlyYield) + monthlySavingsInput;
        totalContributions += monthlySavingsInput;
      }
      const interest = Math.max(0, currentWealth - totalContributions);
      points.push({
        year,
        contributions: totalContributions,
        interest,
        total: currentWealth
      });
    }
    return points;
  }, [roboData, monthlySavingsInput, expectedYieldInput, projectionYearsInput]);

  const renderFormattedAnalysis = (text: string) => {
    if (!text) return null;
    let cleanText = text.replace(/\\"/g, '"');
    cleanText = cleanText.replace(/(\S)\s+\*\s+(\w)/g, "$1\n* $2");
    const lines = cleanText.split("\n").map(l => l.trim()).filter(l => l !== "");
    
    return lines.map((line, idx) => {
      const isBullet = line.startsWith("- ") || line.startsWith("* ");
      let content = line;
      if (isBullet) {
        content = "• " + line.replace(/^[\*\-]\s*/, "");
      }
      
      if (isBullet && content.includes(":")) {
        const colonIdx = content.indexOf(":");
        const boldPart = content.slice(0, colonIdx + 1);
        const normalPart = content.slice(colonIdx + 1);
        return (
          <p key={idx} className="pl-4 leading-relaxed mt-1">
            <strong className="text-stitch-on-surface font-semibold">{boldPart}</strong>
            {normalPart}
          </p>
        );
      }
      
      return (
        <p key={idx} className={isBullet ? "pl-4 leading-relaxed mt-1" : "leading-relaxed"}>
          {content}
        </p>
      );
    });
  };

  return (
    <div className="space-y-xxl">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-md">
        <div>
          <h1 className="font-heading text-h2-kpi text-stitch-on-surface">Quản Lý Đầu Tư & Cố Vấn Tích Lũy AI</h1>
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
              className={`px-4 py-2 rounded-md text-sm font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === "portfolio"
                  ? "bg-white text-stitch-on-surface shadow-sm"
                  : "text-stitch-on-surface-variant hover:text-stitch-on-surface"
              }`}
            >
              Danh Mục & Tài Sản
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setHelpTab("portfolio");
                  setShowHelpModal(true);
                }}
                className="hover:text-stitch-primary-container p-0.5 rounded-full transition-colors cursor-help"
                title="Hướng dẫn sử dụng"
              >
                <HelpCircle className="w-3.5 h-3.5 opacity-70 hover:opacity-100" />
              </span>
            </button>
            <button
              onClick={() => {
                setActiveTab("roboadvisor");
                if (!roboData) fetchRoboData();
              }}
              className={`px-4 py-2 rounded-md text-sm font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === "roboadvisor"
                  ? "bg-white text-stitch-on-surface shadow-sm"
                  : "text-stitch-on-surface-variant hover:text-stitch-on-surface"
              }`}
            >
              <TrendingUp className="w-4 h-4 text-stitch-primary-container" />
              Cố Vấn Tích Lũy AI
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setHelpTab("roboadvisor");
                  setShowHelpModal(true);
                }}
                className="hover:text-stitch-primary-container p-0.5 rounded-full transition-colors cursor-help"
                title="Hướng dẫn sử dụng"
              >
                <HelpCircle className="w-3.5 h-3.5 opacity-70 hover:opacity-100" />
              </span>
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
          {/* Market Indices & ETFs Ticker Bar */}
          <section className="grid grid-cols-2 md:grid-cols-6 gap-md">
            {loadingQuotes ? (
              <div className="col-span-2 md:col-span-6 stitch-card p-4 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-stitch-primary-container" />
                <span className="text-sm text-stitch-on-surface-variant">Đang tải dữ liệu chỉ số thị trường...</span>
              </div>
            ) : marketQuotes.length === 0 ? (
              <div className="col-span-2 md:col-span-6 stitch-card p-4 text-center text-sm text-stitch-on-surface-variant">
                Không lấy được dữ liệu chỉ số thị trường.
              </div>
            ) : (
              marketQuotes.map((item) => {
                const changePct = item.change_percent ?? 0;
                const isUp = changePct >= 0;
                const priceFormatted = item.symbol.includes("INDEX") || item.symbol === "VN30"
                  ? (item.price !== null ? new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(item.price) : "-")
                  : formatCurrency(item.price ?? 0);
                
                return (
                  <div key={item.symbol} className="stitch-card p-3 flex flex-col justify-between hover:border-stitch-outline transition-all duration-200">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-xs text-stitch-on-surface truncate" title={item.name}>{item.name}</span>
                      <span className="text-[10px] px-1 py-0.5 rounded bg-stitch-surface-container text-stitch-on-surface-variant font-semibold">{item.symbol}</span>
                    </div>
                    <div className="mt-2 flex items-baseline justify-between flex-wrap gap-x-2">
                      <span className="font-heading text-sm font-bold text-stitch-on-surface">{priceFormatted}</span>
                      <span className={`text-xs font-bold ${isUp ? "text-success" : "text-danger"}`}>
                        {isUp ? "▲" : "▼"}&nbsp;
                        {isUp ? "+" : ""}{changePct.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </section>

          {/* KPI Dashboard */}
          <section className="grid grid-cols-1 md:grid-cols-4 gap-lg">
            <div className="stitch-card p-lg">
              <p className="text-body-sm text-stitch-on-surface-variant font-medium">Tổng vốn đầu tư đăng ký</p>
              <h2 className="font-heading text-h2-kpi text-stitch-on-surface mt-xs">
                {loadingProfile ? <Loader2 className="w-6 h-6 animate-spin mt-2" /> : formatCurrency(totalCapital)}
              </h2>
              <p className="text-body-xs text-stitch-on-surface-variant mt-3 truncate" title={profile?.goal}>
                Mục tiêu tích lũy: {profile?.goal ? (isNaN(Number(profile.goal)) ? profile.goal : formatCurrency(Number(profile.goal))) : "Chưa thiết lập"}
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
                                <span className="text-xs text-stitch-on-surface-variant block max-w-[150px] truncate text-ellipsis">
                                  {asset.name}
                                  {asset.type === "saving" && asset.interest_rate !== undefined && asset.interest_rate > 0 && ` (${asset.interest_rate}%${asset.term_months ? ` / ${asset.term_months}T` : ""})`}
                                </span>
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
        /* Cố Vấn Tích Lũy & Robo-Advisor AI */
        <div className="space-y-xl">
          {loadingRobo ? (
            <div className="stitch-card p-xl py-24 text-center">
              <Loader2 className="w-12 h-12 animate-spin text-stitch-primary-container mx-auto mb-4" />
              <h4 className="font-heading text-lg font-bold text-stitch-on-surface">Đang phân tích lộ trình tài chính...</h4>
              <p className="text-body-sm text-stitch-on-surface-variant mt-2 max-w-md mx-auto">
                Hệ thống Robo-Advisor đang kết hợp thông tin danh mục thực tế, dòng tiền 30 ngày qua và khẩu vị rủi ro để tính toán lộ trình tích lũy cá nhân hóa cho bạn.
              </p>
            </div>
          ) : !roboData ? (
            <div className="stitch-card p-xl py-12 text-center text-stitch-on-surface-variant flex flex-col items-center justify-center">
              <p className="text-base font-medium">Chưa có dữ liệu phân tích</p>
              {errorMsg && (
                <p className="text-danger text-sm bg-red-50 p-2.5 rounded border border-red-200 mt-2 max-w-md">
                  {errorMsg}
                </p>
              )}
              <button onClick={fetchRoboData} className="btn-primary mt-4 py-2 px-4">
                Tải dữ liệu cố vấn
              </button>
            </div>
          ) : (
            <>
              {/* Robo Advisor Overview KPIs */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-lg">
                <div className="stitch-card p-lg flex flex-col justify-between">
                  <div>
                    <span className="text-body-sm text-stitch-on-surface-variant font-medium">Số Tự do Tài chính (FI)</span>
                    <h3 className="font-heading text-xl font-bold text-stitch-on-surface mt-xs">
                      {formatCurrency(roboData.financial_freedom_number)}
                    </h3>
                  </div>
                  <p className="text-body-xs text-stitch-on-surface-variant mt-3 border-t border-stitch-outline-variant/30 pt-2">
                    Bằng 25 lần chi tiêu năm (Quy tắc 4%)
                  </p>
                </div>

                <div className="stitch-card p-lg flex flex-col justify-between">
                  <div>
                    <span className="text-body-sm text-stitch-on-surface-variant font-medium">Lộ trình đạt FI</span>
                    <h3 className="font-heading text-xl font-bold text-success mt-xs">
                      {roboData.years_to_financial_freedom > 90 ? "Trên 30 năm" : `${roboData.years_to_financial_freedom.toFixed(1)} năm`}
                    </h3>
                  </div>
                  <p className="text-body-xs text-stitch-on-surface-variant mt-3 border-t border-stitch-outline-variant/30 pt-2">
                    Tích lũy gốc & lãi kép
                  </p>
                </div>

                <div className="stitch-card p-lg flex flex-col justify-between">
                  <div>
                    <span className="text-body-sm text-stitch-on-surface-variant font-medium">Tỷ lệ tích lũy (Saving Rate)</span>
                    <h3 className="font-heading text-xl font-bold text-stitch-primary-container mt-xs">
                      {roboData.savings_rate.toFixed(1)}%
                    </h3>
                  </div>
                  <p className="text-body-xs text-stitch-on-surface-variant mt-3 border-t border-stitch-outline-variant/30 pt-2 text-ellipsis overflow-hidden whitespace-nowrap">
                    Tích lũy thực tế: {formatCurrency(Math.max(0, roboData.monthly_income - roboData.monthly_expenses))}/tháng
                  </p>
                </div>

                <div className="stitch-card p-lg flex flex-col justify-between">
                  <div>
                    <span className="text-body-sm text-stitch-on-surface-variant font-medium">Điểm đa dạng hóa (Simpson)</span>
                    <h3 className="font-heading text-xl font-bold text-amber-500 mt-xs">
                      {roboData.diversification_score.toFixed(1)}/100
                    </h3>
                  </div>
                  <p className="text-body-xs text-stitch-on-surface-variant mt-3 border-t border-stitch-outline-variant/30 pt-2 flex items-center justify-between">
                    <span>Phân bổ tối ưu:</span>
                    <span className="font-semibold text-stitch-on-surface capitalize">{roboData.risk_appetite === "conservative" ? "Thận trọng" : roboData.risk_appetite === "moderate" ? "Cân bằng" : "Tăng trưởng"}</span>
                  </p>
                </div>
              </div>

              {/* Interactive Wealth Simulator */}
              <div className="stitch-card p-lg">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-md mb-lg">
                  <div>
                    <h3 className="section-title">Giả Lập Tích Lũy & Sức Mạnh Lãi Kép</h3>
                    <p className="text-body-sm text-stitch-on-surface-variant mt-0.5">Tương tác trực tiếp bằng thanh trượt để lập kế hoạch tương lai</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] px-2 py-1 rounded bg-stitch-surface-container font-semibold border border-stitch-outline-variant/40">
                      Tích lũy hàng tháng: <strong className="text-stitch-primary-container">{formatCurrency(monthlySavingsInput)}</strong>
                    </span>
                    <span className="text-[11px] px-2 py-1 rounded bg-stitch-surface-container font-semibold border border-stitch-outline-variant/40">
                      Lãi suất: <strong className="text-success">{expectedYieldInput}%/năm</strong>
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-xl">
                  {/* Controls */}
                  <div className="lg:col-span-4 space-y-lg bg-stitch-surface-container/30 rounded-xl p-lg border border-stitch-outline-variant/40">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-sm font-semibold">
                        <span className="text-stitch-on-surface">Tiền gửi hàng tháng</span>
                        <span className="text-stitch-primary-container font-bold text-xs bg-stitch-primary-container/10 px-2 py-0.5 rounded">
                          {formatCurrency(monthlySavingsInput)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={500000}
                        max={50000000}
                        step={500000}
                        value={monthlySavingsInput}
                        onChange={(e) => setMonthlySavingsInput(parseInt(e.target.value))}
                        className="w-full h-2 bg-stitch-surface-container rounded-lg appearance-none cursor-pointer accent-stitch-primary-container"
                      />
                      <div className="flex justify-between text-[10px] text-stitch-on-surface-variant">
                        <span>500k</span>
                        <span>10tr</span>
                        <span>25tr</span>
                        <span>50tr</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-sm font-semibold">
                        <span className="text-stitch-on-surface">Tỷ suất sinh lời kỳ vọng</span>
                        <span className="text-success font-bold text-xs bg-green-50 px-2 py-0.5 rounded border border-green-200">
                          {expectedYieldInput}% / năm
                        </span>
                      </div>
                      <input
                        type="range"
                        min={5}
                        max={25}
                        step={0.5}
                        value={expectedYieldInput}
                        onChange={(e) => setExpectedYieldInput(parseFloat(e.target.value))}
                        className="w-full h-2 bg-stitch-surface-container rounded-lg appearance-none cursor-pointer accent-success"
                      />
                      <div className="flex justify-between text-[10px] text-stitch-on-surface-variant">
                        <span>5% (Tiết kiệm)</span>
                        <span>10% (Cổ phiếu VN)</span>
                        <span>25% (Tăng trưởng cao)</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-sm font-semibold">
                        <span className="text-stitch-on-surface">Số năm tích lũy</span>
                        <span className="text-amber-600 font-bold text-xs bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          {projectionYearsInput} năm
                        </span>
                      </div>
                      <input
                        type="range"
                        min={5}
                        max={40}
                        step={1}
                        value={projectionYearsInput}
                        onChange={(e) => setProjectionYearsInput(parseInt(e.target.value))}
                        className="w-full h-2 bg-stitch-surface-container rounded-lg appearance-none cursor-pointer accent-amber-500"
                      />
                      <div className="flex justify-between text-[10px] text-stitch-on-surface-variant">
                        <span>5 năm</span>
                        <span>20 năm</span>
                        <span>40 năm</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-stitch-outline-variant/40 space-y-2 text-xs text-stitch-on-surface-variant leading-relaxed">
                      <p>
                        💡 <strong>Lãi kép:</strong> Số tiền lãi sinh ra tiếp tục được tái đầu tư để tạo lãi trong kỳ tiếp theo. Thời gian tích lũy càng dài, khoảng cách giữa gốc và tổng tài sản càng rộng.
                      </p>
                      <p>
                        📈 <strong>Phân bổ đề xuất:</strong> Bạn nên định kỳ mua rổ chỉ số VN30 hoặc các quỹ ETF như <strong>FUEVFVND</strong> để đạt tỷ suất sinh lời kỳ vọng 10-12%/năm một cách thụ động.
                      </p>
                    </div>
                  </div>

                  {/* Chart */}
                  <div className="lg:col-span-8 h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={calculatedProjectionPoints} margin={{ top: 10, right: 5, bottom: 0, left: 10 }}>
                        <defs>
                          <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10B981" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="contribGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.15} />
                            <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="year" tickFormatter={(y) => `Năm ${y}`} tick={{ fontSize: 11, fill: "#404750" }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={(v) => `${(v / 1000000).toFixed(0)}tr`} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(v: any) => [formatCurrency(Number(v)), ""]} />
                        <Area type="monotone" dataKey="total" name="Tổng tài sản tích lũy" stroke="#10B981" fillOpacity={1} fill="url(#totalGrad)" strokeWidth={2.5} />
                        <Area type="monotone" dataKey="contributions" name="Vốn gốc đóng góp" stroke="#3B82F6" fillOpacity={1} fill="url(#contribGrad)" strokeWidth={1.5} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Robo-Advisor Portfolio Rebalancer */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-xl">
                {/* Allocation Chart Compare */}
                <div className="stitch-card p-lg">
                  <h3 className="section-title mb-lg">So Sánh Tỷ Trọng: Hiện Tại vs. Mục Tiêu (%)</h3>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[
                        {
                          name: "Tiết kiệm",
                          "Hiện tại (%)": Math.round(roboData.actual_allocation.saving || 0),
                          "Mục tiêu (%)": Math.round(roboData.target_allocation.saving * 100)
                        },
                        {
                          name: "Vàng",
                          "Hiện tại (%)": Math.round(roboData.actual_allocation.gold || 0),
                          "Mục tiêu (%)": Math.round(roboData.target_allocation.gold * 100)
                        },
                        {
                          name: "Cổ phiếu",
                          "Hiện tại (%)": Math.round(roboData.actual_allocation.stock || 0),
                          "Mục tiêu (%)": Math.round(roboData.target_allocation.stock * 100)
                        },
                        {
                          name: "Crypto",
                          "Hiện tại (%)": Math.round(roboData.actual_allocation.crypto || 0),
                          "Mục tiêu (%)": Math.round(roboData.target_allocation.crypto * 100)
                        }
                      ]} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                        <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#404750" }} tickLine={false} axisLine={false} />
                        <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                        <Tooltip formatter={(v: any) => [`${v}%`, ""]} />
                        <Bar dataKey="Hiện tại (%)" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Mục tiêu (%)" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Rebalance suggestions */}
                <div className="stitch-card p-lg flex flex-col justify-between">
                  <div>
                    <h3 className="section-title mb-lg">Gợi Ý Cơ Cấu & Tái Cân Bằng Danh Mục</h3>
                    <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                      {roboData.rebalance_suggestions.map((sug) => {
                        const assetLabels: Record<string, string> = {
                          saving: "Tiết kiệm",
                          gold: "Vàng SJC",
                          stock: "Cổ phiếu",
                          crypto: "Crypto"
                        };
                        const label = assetLabels[sug.asset_class] || sug.asset_class;
                        
                        let badgeColor = "bg-stitch-surface-container text-stitch-on-surface-variant";
                        if (sug.action === "Mua thêm") {
                          badgeColor = "bg-green-50 text-success border border-green-200";
                        } else if (sug.action === "Bán bớt") {
                          badgeColor = "bg-red-50 text-danger border border-red-200";
                        }
                        
                        return (
                          <div key={sug.asset_class} className="flex flex-col md:flex-row md:items-center justify-between gap-sm p-md bg-stitch-surface-container/40 rounded-lg border border-stitch-outline-variant/30 text-sm">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-bold text-stitch-on-surface">{label}</span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${badgeColor}`}>
                                  {sug.action}
                                </span>
                              </div>
                              <p className="text-[11px] text-stitch-on-surface-variant leading-relaxed">
                                {sug.reasoning}
                              </p>
                            </div>
                            
                            {Math.abs(sug.difference_value) > 100000 && (
                              <div className="text-right flex-shrink-0">
                                <span className={`font-heading text-sm font-bold block ${sug.difference_value > 0 ? "text-success" : "text-danger"}`}>
                                  {sug.difference_value > 0 ? "+" : ""}{formatCurrency(sug.difference_value)}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Gamified Saving Challenges & AI Insight */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-xl">
                {/* Saving Challenges */}
                <div className="lg:col-span-8 stitch-card p-lg">
                  <div className="flex items-center gap-2 mb-lg">
                    <div className="p-2 bg-stitch-primary-container/10 text-stitch-primary-container rounded-lg">
                      <Award className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="section-title">Thử Thách Tích Lũy Tiết Kiệm</h3>
                      <p className="text-body-sm text-stitch-on-surface-variant mt-0.5">Rèn luyện kỷ luật tài chính cùng trợ lý ảo</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-lg">
                    {roboData.challenges.map((ch) => {
                      const prog = challengeProgress[ch.id] || { current: 0, joined: false };
                      const pct = Math.min(100, Math.max(0, (prog.current / ch.target_amount) * 100));
                      
                      return (
                        <div key={ch.id} className="bg-stitch-surface-container/30 border border-stitch-outline-variant/40 rounded-xl p-md flex flex-col justify-between h-full text-sm">
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-2xl">{ch.badge}</span>
                              {prog.joined ? (
                                <span className="text-[10px] font-bold text-success bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                                  Đang chạy
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold text-stitch-on-surface-variant bg-stitch-surface-container px-2 py-0.5 rounded-full">
                                  Chưa tham gia
                                </span>
                              )}
                            </div>
                            <h4 className="font-heading text-sm font-bold text-stitch-on-surface mb-1">{ch.title}</h4>
                            <p className="text-[11px] text-stitch-on-surface-variant leading-relaxed mb-4 min-h-[50px]">{ch.description}</p>
                          </div>

                          <div className="space-y-3 mt-auto">
                            {prog.joined && (
                              <div className="space-y-1">
                                <div className="flex justify-between text-[10px] font-semibold">
                                  <span className="text-stitch-on-surface-variant">Tiến độ: {pct.toFixed(0)}%</span>
                                  <span className="text-stitch-on-surface">{formatCurrency(prog.current)} / {formatCurrency(ch.target_amount)}</span>
                                </div>
                                <div className="w-full bg-stitch-surface-container rounded-full h-1.5 overflow-hidden">
                                  <div className="bg-success h-full transition-all duration-300" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            )}

                            {!prog.joined ? (
                              <button
                                onClick={() => handleJoinChallenge(ch.id)}
                                className="btn-primary w-full py-1.5 text-xs font-semibold flex items-center justify-center gap-1"
                              >
                                Tham gia thử thách
                              </button>
                            ) : (
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => {
                                    let defaultDeposit = 100000;
                                    if (ch.id === "52_weeks") defaultDeposit = 100000;
                                    else if (ch.id === "no_bubble_tea") defaultDeposit = 30000;
                                    else if (ch.id === "blue_chip_accumulation") defaultDeposit = 500000;

                                    const amountStr = window.prompt(`Nhập số tiền bạn muốn đóng góp cho thử thách "${ch.title}" (VND):`, defaultDeposit.toString());
                                    if (amountStr) {
                                      const amt = parseFloat(amountStr);
                                      if (!isNaN(amt) && amt > 0) {
                                        const sync = window.confirm("Bạn có muốn tự động cộng dồn số tiền này vào tài sản 'Gửi Tiết Kiệm' trong danh mục thực tế của bạn không?");
                                        handleDepositChallenge(ch.id, amt, sync);
                                      }
                                    }
                                  }}
                                  className="btn-outline w-full py-1.5 text-xs font-semibold flex items-center justify-center gap-1 hover:bg-stitch-surface-container"
                                >
                                  Tích lũy thêm
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* AI Advisor Insight */}
                <div className="lg:col-span-4 stitch-card p-lg flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-lg">
                      <div className="flex items-center gap-2">
                        <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                          <Sparkles className="w-5 h-5 animate-pulse" />
                        </div>
                        <h3 className="section-title">Nhận Định Cá Nhân Hóa AI</h3>
                      </div>
                      <button
                        onClick={fetchRoboData}
                        className="p-1 hover:bg-stitch-surface-container rounded text-stitch-on-surface-variant hover:text-stitch-on-surface transition-colors"
                        title="Tải lại nhận định từ Gemini"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="text-body-sm text-stitch-on-surface-variant leading-relaxed space-y-3 max-h-[300px] overflow-y-auto pr-1">
                      {renderFormattedAnalysis(roboData.overall_analysis)}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* --- MODALS --- */}

      {/* Help Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-stitch-outline-variant/60 max-w-lg w-full p-lg space-y-lg animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-stitch-outline-variant/60 pb-3">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-stitch-primary-container" />
                <h3 className="font-heading text-lg font-bold text-stitch-on-surface">Hướng Dẫn Sử Dụng</h3>
              </div>
              <button
                onClick={() => setShowHelpModal(false)}
                className="text-stitch-on-surface-variant hover:text-stitch-on-surface font-semibold text-sm bg-stitch-surface-container hover:bg-stitch-outline-variant/20 px-3 py-1 rounded"
              >
                Đóng
              </button>
            </div>

            {/* Modal Internal Tab Selector */}
            <div className="flex bg-stitch-surface-container rounded-lg p-0.5 border border-stitch-outline-variant/40">
              <button
                onClick={() => setHelpTab("portfolio")}
                className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  helpTab === "portfolio"
                    ? "bg-white text-stitch-on-surface shadow-sm font-bold"
                    : "text-stitch-on-surface-variant hover:text-stitch-on-surface"
                }`}
              >
                Danh Mục & Tài Sản
              </button>
              <button
                onClick={() => setHelpTab("roboadvisor")}
                className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  helpTab === "roboadvisor"
                    ? "bg-white text-stitch-on-surface shadow-sm font-bold"
                    : "text-stitch-on-surface-variant hover:text-stitch-on-surface"
                }`}
              >
                Cố Vấn Tích Lũy AI
              </button>
            </div>

            {/* Modal Content */}
            <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
              {helpTab === "portfolio" ? (
                <div className="space-y-4 text-sm text-stitch-on-surface-variant leading-relaxed">
                  <div>
                    <h4 className="font-bold text-stitch-on-surface flex items-center gap-1.5 mb-1.5 text-body-sm uppercase tracking-wide">
                      <span className="text-stitch-primary-container">📈</span> 1. Bảng Chỉ Số Thị Trường & Quỹ ETF
                    </h4>
                    <p className="pl-6">
                      Thanh ở trên cùng hiển thị dữ liệu giá và biến động phần trăm theo ngày của <strong>VN-Index</strong>, <strong>VN30</strong>, <strong>HNX-Index</strong> và các chứng chỉ quỹ ETF tiêu biểu. Chỉ số được cập nhật từ bảng giá thực tế hàng ngày.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-bold text-stitch-on-surface flex items-center gap-1.5 mb-1.5 text-body-sm uppercase tracking-wide">
                      <span className="text-stitch-primary-container">🤖</span> 2. Trợ Lý AI Thêm Nhanh (Quick-Add)
                    </h4>
                    <p className="pl-6">
                      Bạn có thể mô tả bằng giọng nói/văn bản tự nhiên trong tab "🤖 Trợ lý AI", ví dụ: <em>"Mới gửi tiết kiệm 50 triệu"</em> hoặc <em>"Mua 1 lượng vàng SJC giá 84 triệu"</em>. Gemini sẽ tự phân tích số lượng, giá trị và phân loại rồi điền form giúp bạn.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-bold text-stitch-on-surface flex items-center gap-1.5 mb-1.5 text-body-sm uppercase tracking-wide">
                      <span className="text-stitch-primary-container">✏️</span> 3. Nhập Thủ Công & Gợi Ý Thông Minh
                    </h4>
                    <p className="pl-6">
                      Khi nhập thủ công, hệ thống hỗ trợ <strong>autocomplete tự điền</strong> hơn 70+ mã cổ phiếu Việt Nam và tự động lấy giá live thị trường. Form cũng tích hợp <strong>tự động chuẩn hóa đơn vị</strong> (SJC từ triệu sang VND, Cổ phiếu nhân 1.000, BTC từ USD sang VND).
                    </p>
                  </div>

                  <div>
                    <h4 className="font-bold text-stitch-on-surface flex items-center gap-1.5 mb-1.5 text-body-sm uppercase tracking-wide">
                      <span className="text-stitch-primary-container">⚙️</span> 4. Cấu Hình Vốn & Khẩu Vị Rủi Ro
                    </h4>
                    <p className="pl-6">
                      Nhấp vào biểu tượng bánh răng ở góc trên để đổi Khẩu vị rủi ro (Thận trọng, Cân bằng, Tăng trưởng) và Tổng Vốn đầu tư. Phần tiền nhàn rỗi (Vốn khả dụng) sẽ bằng Tổng vốn trừ đi giá trị danh mục thực tế.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 text-sm text-stitch-on-surface-variant leading-relaxed">
                  <div>
                    <h4 className="font-bold text-stitch-on-surface flex items-center gap-1.5 mb-1.5 text-body-sm uppercase tracking-wide">
                      <span className="text-success">🎯</span> 1. Con Số Tự Do Tài Chính (FI Number)
                    </h4>
                    <p className="pl-6">
                      Là số vốn tích lũy cần có để bạn có thể nghỉ hưu sớm mà không lo lắng về tài chính. Hệ thống tự động tính bằng <strong>25 lần chi tiêu năm thực tế</strong> của bạn (áp dụng quy tắc rút 4% an toàn của nghiên cứu Trinity).
                    </p>
                  </div>

                  <div>
                    <h4 className="font-bold text-stitch-on-surface flex items-center gap-1.5 mb-1.5 text-body-sm uppercase tracking-wide">
                      <span className="text-success">🎚️</span> 2. Giả Lập Tăng Trưởng Lãi Kép
                    </h4>
                    <p className="pl-6">
                      Bạn có thể kéo các thanh trượt để mô phỏng kế hoạch tích lũy dài hạn. Biểu đồ sẽ hiển thị rõ ràng số tiền gốc bạn bỏ ra (đường xanh lam) và tổng giá trị nhận được nhờ sức mạnh lãi kép tích lũy qua năm tháng (đường xanh lục).
                    </p>
                  </div>

                  <div>
                    <h4 className="font-bold text-stitch-on-surface flex items-center gap-1.5 mb-1.5 text-body-sm uppercase tracking-wide">
                      <span className="text-success">🔄</span> 3. Đề Xuất Tái Cân Bằng (Rebalancing)
                    </h4>
                    <p className="pl-6">
                      Mỗi hồ sơ rủi ro có tỷ trọng phân bổ tối ưu riêng. Robo-Advisor sẽ so sánh tài sản hiện tại của bạn và gợi ý hành động mua thêm hoặc bán bớt chính xác bao nhiêu tiền để giảm thiểu rủi ro biến động thị trường.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-bold text-stitch-on-surface flex items-center gap-1.5 mb-1.5 text-body-sm uppercase tracking-wide">
                      <span className="text-success">🏆</span> 4. Thử Thách Tiết Kiệm Tích Hợp
                    </h4>
                    <p className="pl-6">
                      Rèn luyện thói quen tích lũy với Thử thách 52 tuần, Cắt giảm trà sữa, Tích sản cổ phiếu. Khi bạn tích lũy, hệ thống hỗ trợ <strong>đồng bộ tự động cộng dồn số tiền tích lũy vào tài sản Gửi Tiết Kiệm thực tế</strong> để tối ưu hóa quản lý.
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div className="border-t border-stitch-outline-variant/40 pt-3 text-[11px] text-stitch-on-surface-variant text-center">
              Spend-Sense AI Cố Vấn Đầu Tư — Rèn luyện kỷ luật, tối ưu hóa lãi kép
            </div>
          </div>
        </div>
      )}

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
                {profileForm.capital > 0 && (
                  <span className="text-xs text-stitch-primary-container block mt-1">
                    Định dạng: <strong>{formatCurrency(profileForm.capital)}</strong> {formatNumberToVietnameseWords(profileForm.capital) && `(${formatNumberToVietnameseWords(profileForm.capital)})`}
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-stitch-on-surface">Số tiền tích lũy mục tiêu (VND)</label>
                <input
                  type="number"
                  required
                  min="0"
                  value={profileForm.goal || ""}
                  onChange={(e) => setProfileForm({ ...profileForm, goal: e.target.value })}
                  className="w-full bg-stitch-surface-container rounded-lg p-2.5 border border-stitch-outline-variant/60 text-sm focus:outline-none focus:ring-2 focus:ring-stitch-primary-container"
                  placeholder="Ví dụ: 2000000000 (2 tỷ VND)"
                />
                {profileForm.goal && !isNaN(Number(profileForm.goal)) && Number(profileForm.goal) > 0 && (
                  <span className="text-xs text-stitch-primary-container block mt-1">
                    Định dạng: <strong>{formatCurrency(Number(profileForm.goal))}</strong> {formatNumberToVietnameseWords(Number(profileForm.goal)) && `(${formatNumberToVietnameseWords(Number(profileForm.goal))})`}
                  </span>
                )}
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
                    <label className="text-sm font-semibold text-stitch-on-surface block">
                      {assetForm.type === "saving" ? "Số sổ / Khoản gửi" : "Số lượng sở hữu"}
                    </label>
                    <input
                      type="number"
                      required
                      step="any"
                      min="0"
                      value={assetForm.quantity || ""}
                      onChange={(e) => setAssetForm({ ...assetForm, quantity: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-stitch-surface-container rounded-lg p-2.5 border border-stitch-outline-variant/60 text-sm focus:outline-none focus:ring-2 focus:ring-stitch-primary-container"
                      placeholder={assetForm.type === "saving" ? "Ví dụ: 1" : "Ví dụ: 1000"}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-stitch-on-surface block">
                      {assetForm.type === "saving" ? "Số tiền gửi (VND)" : "Giá mua trung bình (VND)"}
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={assetForm.purchase_price || ""}
                      onChange={(e) => setAssetForm({ ...assetForm, purchase_price: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-stitch-surface-container rounded-lg p-2.5 border border-stitch-outline-variant/60 text-sm focus:outline-none focus:ring-2 focus:ring-stitch-primary-container"
                      placeholder="Ví dụ: 50000000"
                    />
                    {assetForm.purchase_price > 0 && (
                      <div className="mt-1.5 text-xs text-stitch-on-surface-variant flex flex-col gap-1 border-t border-stitch-outline-variant/30 pt-1">
                        <span>Định dạng hiển thị: <strong className="text-stitch-primary-container">{formatCurrency(assetForm.purchase_price)}</strong> {formatNumberToVietnameseWords(assetForm.purchase_price) && `(${formatNumberToVietnameseWords(assetForm.purchase_price)})`}</span>
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

                {assetForm.type === "saving" && (
                  <div className="grid grid-cols-2 gap-md mt-4">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-stitch-on-surface block">Lãi suất (% / năm)</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={assetForm.interest_rate || ""}
                        onChange={(e) => setAssetForm({ ...assetForm, interest_rate: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-stitch-surface-container rounded-lg p-2.5 border border-stitch-outline-variant/60 text-sm focus:outline-none focus:ring-2 focus:ring-stitch-primary-container"
                        placeholder="Ví dụ: 5.5"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-stitch-on-surface block">Kỳ hạn (tháng)</label>
                      <input
                        type="number"
                        min="0"
                        value={assetForm.term_months || ""}
                        onChange={(e) => setAssetForm({ ...assetForm, term_months: parseInt(e.target.value) || 0 })}
                        className="w-full bg-stitch-surface-container rounded-lg p-2.5 border border-stitch-outline-variant/60 text-sm focus:outline-none focus:ring-2 focus:ring-stitch-primary-container"
                        placeholder="Ví dụ: 12"
                      />
                    </div>
                  </div>
                )}

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
