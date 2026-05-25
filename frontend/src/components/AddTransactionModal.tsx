import { useCallback, useMemo, useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  ChevronDown,
  Image as ImageIcon,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  analyzeReceipt,
  createTransaction,
  type AnalyzeReceiptResult,
  type DetectedField,
  type ReceiptDraftItem,
} from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

interface AddTransactionModalProps {
  open: boolean;
  onClose: () => void;
}

const categories = [
  { value: "an-uong", label: "Ăn uống" },
  { value: "di-chuyen", label: "Di chuyển" },
  { value: "mua-sam", label: "Mua sắm" },
  { value: "nha-o", label: "Nhà ở" },
  { value: "suc-khoe", label: "Sức khỏe" },
  { value: "giai-tri", label: "Giải trí" },
  { value: "giao-duc", label: "Giáo dục" },
  { value: "dau-tu", label: "Đầu tư" },
  { value: "luong", label: "Lương" },
  { value: "thuong", label: "Thưởng" },
  { value: "khac", label: "Khác" },
];

type TxType = "expense" | "income";
type Step = "form" | "receipt" | "success";
type CameraState = "idle" | "active" | "captured";
type PriceMode = "unit" | "line";
type ReviewField = "name" | "quantity" | "unit_price";

interface ReviewItem {
  id: string;
  name: string;
  quantity: number;
  unit_price: number;
  category: string;
  source_token_ids: Record<ReviewField, string | null>;
}

interface EditingCell {
  rowId: string;
  field: ReviewField;
}

function dataUrlToFile(dataUrl: string, filename: string): File {
  const [meta, payload] = dataUrl.split(",");
  const mime = meta.match(/:(.*?);/)?.[1] ?? "image/jpeg";
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], filename, { type: mime });
}

function parseNumber(value: string): number {
  const cleaned = value.replace(/[^\d.,]/g, "").replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseMoney(value: string): number {
  const cleaned = value.replace(/[^\d]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function makeReviewItem(item?: Partial<ReceiptDraftItem>): ReviewItem {
  return {
    id: item?.id ?? crypto.randomUUID(),
    name: item?.name ?? "",
    quantity: 1,
    unit_price: Number(item?.total_price ?? item?.unit_price ?? 0),
    category: item?.category ?? "khac",
    source_token_ids: {
      name: item?.source_token_ids?.name ?? null,
      quantity: item?.source_token_ids?.quantity ?? null,
      unit_price: item?.source_token_ids?.unit_price ?? null,
    },
  };
}

function fieldLabel(field: ReviewField): string {
  if (field === "name") return "Tên món";
  if (field === "quantity") return "SL";
  return "Đơn giá";
}

function tokenColor(className: string): string {
  const normalized = className.toLowerCase();
  if (normalized === "item") return "border-blue-200 bg-blue-50 text-blue-800";
  if (normalized === "quantity") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (normalized === "price") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-stitch-outline-variant bg-stitch-surface-container text-stitch-on-surface";
}

function isStoreNameToken(field: DetectedField): boolean {
  return field.class_name.trim().toLowerCase().replace(/[-\s]+/g, "_") === "store_name";
}

function isQuantityToken(field: DetectedField): boolean {
  return field.class_name.trim().toLowerCase().replace(/[-\s]+/g, "_") === "quantity";
}

function dominantCategory(items: ReviewItem[]): string {
  const totals = new Map<string, number>();
  items.forEach((item) => {
    totals.set(item.category, (totals.get(item.category) ?? 0) + item.unit_price);
  });
  return Array.from(totals.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "khac";
}

export function AddTransactionModal({ open, onClose }: Readonly<AddTransactionModalProps>) {
  const [step, setStep] = useState<Step>("form");
  const [txType, setTxType] = useState<TxType>("expense");
  const [amount, setAmount] = useState("");
  const [itemName, setItemName] = useState("");
  const [transactionDate, setTransactionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState("khac");
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [receiptTab, setReceiptTab] = useState<"upload" | "camera">("upload");
  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [apiError, setApiError] = useState("");
  const [analysis, setAnalysis] = useState<AnalyzeReceiptResult | null>(null);
  const [detectedFields, setDetectedFields] = useState<DetectedField[]>([]);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [draggedTokenId, setDraggedTokenId] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [priceMode, setPriceMode] = useState<PriceMode>("unit");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const computedTotal = useMemo(
    () => reviewItems.reduce((sum, item) => sum + (priceMode === "line" ? item.unit_price : item.quantity * item.unit_price), 0),
    [priceMode, reviewItems],
  );

  const assignedTokenIds = useMemo(() => {
    const ids = new Set<string>();
    reviewItems.forEach((item) => {
      Object.values(item.source_token_ids).forEach((tokenId) => tokenId && ids.add(tokenId));
    });
    return ids;
  }, [reviewItems]);

  const unassignedTokens = detectedFields.filter((field) => !assignedTokenIds.has(field.id));

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraState("idle");
  }, []);

  const resetAndClose = useCallback(() => {
    setStep("form");
    setTxType("expense");
    setAmount("");
    setItemName("");
    setTransactionDate(new Date().toISOString().slice(0, 10));
    setCategory("khac");
    setReceiptPreview(null);
    setReceiptFile(null);
    setCameraState("idle");
    setReceiptTab("upload");
    setIsSaving(false);
    setIsAnalyzing(false);
    setApiError("");
    setAnalysis(null);
    setDetectedFields([]);
    setReviewItems([]);
    setDraggedTokenId(null);
    setEditingCell(null);
    setEditingValue("");
    setPriceMode("unit");
    stopCamera();
    onClose();
  }, [onClose, stopCamera]);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraState("active");
    } catch {
      setApiError("Không thể truy cập camera. Hãy kiểm tra quyền trình duyệt.");
    }
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setReceiptPreview(dataUrl);
    setReceiptFile(dataUrlToFile(dataUrl, "receipt-camera.jpg"));
    setAnalysis(null);
    setDetectedFields([]);
    setReviewItems([]);
    setCameraState("captured");
    stopCamera();
  }, [stopCamera]);

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setReceiptFile(file);
    setApiError("");
    setAnalysis(null);
    setDetectedFields([]);
    setReviewItems([]);
    const reader = new FileReader();
    reader.onload = (ev) => setReceiptPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const applyReceiptAnalysis = async () => {
    if (!receiptFile) return;

    setIsAnalyzing(true);
    setApiError("");
    try {
      const result = await analyzeReceipt(receiptFile);
      const suggested = result.suggested_transaction;
      const receipt = result.receipt;
      const nextItems = receipt?.items?.length ? receipt.items.map((item) => makeReviewItem(item)) : [makeReviewItem()];
      const nextAmount = suggested?.amount || receipt?.total_amount || 0;
      const nextMerchant = suggested?.merchant || receipt?.merchant || "";

      setAnalysis(result);
      setDetectedFields((result.detected_fields ?? []).filter((field) => !isStoreNameToken(field) && !isQuantityToken(field)));
      setReviewItems(nextItems);
      setPriceMode("unit");
      setAmount(String(nextAmount || ""));
      setItemName(nextItems[0]?.name || nextMerchant || "");
      setCategory(suggested?.category || dominantCategory(nextItems));
      setTransactionDate(suggested?.transaction_date || new Date().toISOString().slice(0, 10));
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Không thể phân tích hóa đơn.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const assignToken = (rowId: string, field: ReviewField) => {
    if (!draggedTokenId) return;
    const token = detectedFields.find((candidate) => candidate.id === draggedTokenId);
    if (!token) return;

    setReviewItems((items) =>
      items.map((item) => {
        const clearedSources = Object.fromEntries(
          Object.entries(item.source_token_ids).map(([key, value]) => [key, value === token.id ? null : value]),
        ) as Record<ReviewField, string | null>;
        if (item.id !== rowId) return { ...item, source_token_ids: clearedSources };
        const next = { ...item, source_token_ids: { ...clearedSources, [field]: token.id } };
        if (field === "name") next.name = token.text;
        if (field === "quantity") next.quantity = parseNumber(token.text) || 1;
        if (field === "unit_price") next.unit_price = parseMoney(token.text);
        return next;
      }),
    );
    setDraggedTokenId(null);
  };

  const updateCellValue = (rowId: string, field: ReviewField, value: string) => {
    setReviewItems((items) =>
      items.map((row) => {
        if (row.id !== rowId) return row;
        if (field === "name") return { ...row, name: value };
        if (field === "quantity") return { ...row, quantity: parseNumber(value) || 1 };
        return { ...row, unit_price: parseMoney(value) };
      }),
    );
  };

  const startEditingCell = (item: ReviewItem, field: ReviewField) => {
    setEditingCell({ rowId: item.id, field });
    setEditingValue(field === "name" ? item.name : String(item[field]));
  };

  const commitEditingCell = () => {
    if (!editingCell) return;
    updateCellValue(editingCell.rowId, editingCell.field, editingValue);
    setEditingCell(null);
    setEditingValue("");
  };

  const addReviewRow = () => setReviewItems((items) => [...items, makeReviewItem()]);
  const removeReviewRow = (rowId: string) => setReviewItems((items) => items.filter((item) => item.id !== rowId));
  const updateRowCategory = (rowId: string, nextCategory: string) => {
    setReviewItems((items) => items.map((item) => (item.id === rowId ? { ...item, category: nextCategory } : item)));
  };

  const renderEditableCell = (item: ReviewItem, field: ReviewField) => {
    const isEditing = editingCell?.rowId === item.id && editingCell.field === field;
    const rawValue = field === "name" ? item.name : String(item[field]);
    const displayValue = field === "unit_price" ? formatCurrency(item.unit_price) : rawValue;
    const tokenId = item.source_token_ids[field];

    if (isEditing) {
      return (
        <input
          autoFocus
          className="min-h-10 w-full rounded-md border border-brand-blue bg-white px-2 py-1 text-left outline-none ring-2 ring-brand-blue/20"
          type={field === "name" ? "text" : "text"}
          inputMode={field === "name" ? "text" : "decimal"}
          value={editingValue}
          onChange={(event) => setEditingValue(event.target.value)}
          onBlur={commitEditingCell}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commitEditingCell();
            }
            if (event.key === "Escape") {
              setEditingCell(null);
              setEditingValue("");
            }
          }}
        />
      );
    }

    return (
      <button
        draggable={Boolean(tokenId)}
        onDragStart={() => tokenId && setDraggedTokenId(tokenId)}
        onDrop={() => assignToken(item.id, field)}
        onDragOver={(event) => event.preventDefault()}
        onDoubleClick={() => startEditingCell(item, field)}
        className="min-h-10 w-full text-left rounded-md px-2 py-1 hover:bg-blue-50 border border-transparent hover:border-blue-200 cursor-text"
        title="Double-click để sửa trực tiếp. Kéo ô này sang ô khác để đổi token."
      >
        {displayValue || `Kéo ${fieldLabel(field).toLowerCase()} vào đây`}
      </button>
    );
  };

  const handleSave = async () => {
    const total = computedTotal || parseMoney(amount);
    const itemRows = txType === "income"
      ? []
      : reviewItems.length
      ? reviewItems.filter((item) => item.name.trim())
      : itemName.trim()
        ? [{ id: crypto.randomUUID(), name: itemName.trim(), quantity: 1, unit_price: total, category, source_token_ids: { name: null, quantity: null, unit_price: null } }]
        : [];
    const transactionName = itemRows.map((item) => item.name).join(", ");
    setIsSaving(true);
    setApiError("");
    try {
      await createTransaction({
        type: txType,
        amount: total,
        currency: "VND",
        category,
        description: transactionName,
        merchant: "",
        transaction_date: transactionDate || null,
        receipt_items: itemRows
          .map((item) => ({
            name: item.name,
            quantity: priceMode === "line" ? 1 : item.quantity,
            unit_price: item.unit_price,
            category: item.category,
          })),
      });
      setAmount(String(total));
      setStep("success");
      setTimeout(() => resetAndClose(), 1400);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Không thể lưu giao dịch.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && resetAndClose()}>
      <div className={`modal-panel ${step === "receipt" && analysis ? "receipt-modal-panel" : ""}`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-stitch-outline-variant">
          <div>
            <h2 className="font-heading text-xl font-bold text-stitch-on-surface">
              {step === "form" && "Thêm Giao Dịch"}
              {step === "receipt" && (analysis ? "Kiểm Tra Hóa Đơn" : "Chụp / Tải Hóa Đơn")}
              {step === "success" && "Thành Công"}
            </h2>
            <p className="text-sm text-stitch-on-surface-variant mt-0.5">
              {step === "receipt" && analysis
                ? "Kéo token vào đúng ô, double-click để sửa. Có thể đổi giữa đơn giá và thành tiền."
                : "Nhập thông tin hoặc phân tích hóa đơn bằng backend."}
            </p>
          </div>
          <button
            onClick={resetAndClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-stitch-on-surface-variant hover:bg-stitch-surface-container transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === "success" && (
          <div className="flex flex-col items-center justify-center py-16 px-6 gap-4">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <p className="font-heading text-lg font-semibold text-stitch-on-surface">Đã lưu giao dịch</p>
            <p className="text-base text-stitch-on-surface-variant text-center">
              Giao dịch và các dòng hàng đã được gửi lên backend.
            </p>
          </div>
        )}

        {step === "receipt" && (
          <div className="p-6 space-y-5">
            {!analysis && (
              <>
                <div className="flex gap-2 bg-stitch-surface-container p-1 rounded-lg">
                  <button
                    onClick={() => {
                      setReceiptTab("upload");
                      stopCamera();
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${receiptTab === "upload" ? "bg-white shadow-soft text-stitch-on-surface" : "text-stitch-on-surface-variant"}`}
                  >
                    <Upload className="w-4 h-4" />
                    Tải ảnh lên
                  </button>
                  <button
                    onClick={() => setReceiptTab("camera")}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${receiptTab === "camera" ? "bg-white shadow-soft text-stitch-on-surface" : "text-stitch-on-surface-variant"}`}
                  >
                    <Camera className="w-4 h-4" />
                    Mở camera
                  </button>
                </div>

                {receiptTab === "upload" && (
                  <div>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                    {receiptPreview ? (
                      <div className="space-y-3">
                        <img src={receiptPreview} alt="Hoa don" className="w-full rounded-lg border border-stitch-outline-variant object-cover max-h-64" />
                        <button
                          onClick={() => {
                            setReceiptPreview(null);
                            setReceiptFile(null);
                          }}
                          className="text-sm text-brand-blue-dark underline"
                        >
                          Chọn ảnh khác
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full h-44 rounded-lg border-2 border-dashed border-stitch-outline-variant flex flex-col items-center justify-center gap-3 text-stitch-on-surface-variant hover:border-brand-blue hover:text-brand-blue-dark hover:bg-blue-50/50 transition-all"
                      >
                        <div className="w-12 h-12 rounded-full bg-stitch-surface-container flex items-center justify-center">
                          <ImageIcon className="w-6 h-6" />
                        </div>
                        <div className="text-center">
                          <p className="font-semibold text-base">Nhấn để chọn ảnh</p>
                          <p className="text-sm">PNG, JPG, WEBP tối đa 10MB</p>
                        </div>
                      </button>
                    )}
                  </div>
                )}

                {receiptTab === "camera" && (
                  <div className="space-y-3">
                    {cameraState === "idle" && !receiptPreview && (
                      <button
                        onClick={startCamera}
                        className="w-full h-44 rounded-lg border-2 border-dashed border-stitch-outline-variant flex flex-col items-center justify-center gap-3 text-stitch-on-surface-variant hover:border-brand-blue hover:text-brand-blue-dark hover:bg-blue-50/50 transition-all"
                      >
                        <Camera className="w-6 h-6" />
                        <span className="font-semibold text-base">Mở camera</span>
                      </button>
                    )}

                    {cameraState === "active" && (
                      <div className="relative">
                        <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-lg border border-stitch-outline-variant max-h-72 object-cover" />
                        <div className="flex gap-2 mt-3">
                          <button onClick={capturePhoto} className="flex-1 btn-primary flex items-center justify-center gap-2">
                            <Camera className="w-4 h-4" />
                            Chụp ảnh
                          </button>
                          <button onClick={stopCamera} className="btn-outline px-4">
                            Hủy
                          </button>
                        </div>
                      </div>
                    )}

                    {cameraState === "captured" && receiptPreview && (
                      <div className="space-y-3">
                        <img src={receiptPreview} alt="Hóa đơn đã chụp" className="w-full rounded-lg border border-stitch-outline-variant object-cover max-h-64" />
                        <button
                          onClick={() => {
                            setReceiptPreview(null);
                            setReceiptFile(null);
                            setCameraState("idle");
                          }}
                          className="btn-outline w-full text-sm"
                        >
                          Chụp lại
                        </button>
                      </div>
                    )}
                    <canvas ref={canvasRef} className="hidden" />
                  </div>
                )}

                {receiptPreview && (
                  <div className="flex items-center gap-3 bg-stitch-secondary-container/30 rounded-lg px-4 py-3">
                    <div className="w-6 h-6 rounded-full bg-brand-blue flex items-center justify-center flex-shrink-0">
                      {isAnalyzing ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" /> : <span className="text-white text-xs">AI</span>}
                    </div>
                    <p className="text-sm text-stitch-on-surface-variant">
                      {isAnalyzing ? "Đang detect box và OCR từng vùng..." : "Sẵn sàng phân tích hóa đơn."}
                    </p>
                  </div>
                )}
              </>
            )}

            {analysis && (
              <div className="grid grid-cols-1 lg:grid-cols-[0.95fr_1.25fr] gap-5">
                <div className="space-y-4">
                  <div className="stitch-card p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-heading font-semibold text-base">Bill gốc</h3>
                      <span className="text-xs text-stitch-on-surface-variant">{detectedFields.length} token</span>
                    </div>
                    {receiptPreview && (
                      <img src={receiptPreview} alt="Bill gốc" className="w-full max-h-[560px] object-contain rounded-lg bg-stitch-surface-container" />
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-stitch-on-surface-variant uppercase">Ngày</span>
                      <input className="stitch-input py-2" type="date" value={transactionDate} onChange={(event) => setTransactionDate(event.target.value)} />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-stitch-on-surface-variant uppercase">Danh mục giao dịch</span>
                      <select className="stitch-input py-2" value={category} onChange={(event) => setCategory(event.target.value)}>
                        {categories.map((item) => (
                          <option key={item.value} value={item.value}>{item.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="inline-flex rounded-lg border border-stitch-outline-variant bg-stitch-surface-container p-1 text-sm font-semibold">
                    <button
                      type="button"
                      onClick={() => setPriceMode("unit")}
                      className={`rounded-md px-3 py-2 transition-colors ${priceMode === "unit" ? "bg-white text-stitch-on-surface shadow-soft" : "text-stitch-on-surface-variant"}`}
                    >
                      SL x đơn giá
                    </button>
                    <button
                      type="button"
                      onClick={() => setPriceMode("line")}
                      className={`rounded-md px-3 py-2 transition-colors ${priceMode === "line" ? "bg-white text-stitch-on-surface shadow-soft" : "text-stitch-on-surface-variant"}`}
                    >
                      Thành tiền
                    </button>
                  </div>

                  <div className="stitch-card overflow-x-auto">
                    <div className={priceMode === "line" ? "min-w-[640px]" : "min-w-[760px]"}>
                      {priceMode === "line" ? (
                        <>
                          <div className="grid grid-cols-[1.45fr_0.9fr_1fr_40px] gap-0 bg-stitch-surface-container px-3 py-2 text-xs font-bold uppercase text-stitch-on-surface-variant">
                            <span>Tên món</span>
                            <span>Thành tiền</span>
                            <span>Danh mục</span>
                            <span />
                          </div>
                          <div className="divide-y divide-stitch-outline-variant/60">
                            {reviewItems.map((item) => (
                              <div key={item.id} className="grid grid-cols-[1.45fr_0.9fr_1fr_40px] gap-0 px-3 py-2 items-center text-sm">
                                {renderEditableCell(item, "name")}
                                {renderEditableCell(item, "unit_price")}
                                <select
                                  className="min-h-10 w-full rounded-md border border-stitch-outline-variant bg-white px-2 py-1 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20"
                                  value={item.category}
                                  onChange={(event) => updateRowCategory(item.id, event.target.value)}
                                >
                                  {categories.map((categoryOption) => (
                                    <option key={categoryOption.value} value={categoryOption.value}>{categoryOption.label}</option>
                                  ))}
                                </select>
                                <button onClick={() => removeReviewRow(item.id)} className="w-8 h-8 rounded-md hover:bg-red-50 text-red-600 flex items-center justify-center">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="grid grid-cols-[1.4fr_0.55fr_0.8fr_0.85fr_1fr_40px] gap-0 bg-stitch-surface-container px-3 py-2 text-xs font-bold uppercase text-stitch-on-surface-variant">
                            <span>Tên món</span>
                            <span>SL</span>
                            <span>Đơn giá</span>
                            <span>Thành tiền</span>
                            <span>Danh mục</span>
                            <span />
                          </div>
                          <div className="divide-y divide-stitch-outline-variant/60">
                            {reviewItems.map((item) => (
                              <div key={item.id} className="grid grid-cols-[1.4fr_0.55fr_0.8fr_0.85fr_1fr_40px] gap-0 px-3 py-2 items-center text-sm">
                                {renderEditableCell(item, "name")}
                                {renderEditableCell(item, "quantity")}
                                {renderEditableCell(item, "unit_price")}
                                <span className="font-semibold tabular-nums">{formatCurrency(item.quantity * item.unit_price)}</span>
                                <select
                                  className="min-h-10 w-full rounded-md border border-stitch-outline-variant bg-white px-2 py-1 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20"
                                  value={item.category}
                                  onChange={(event) => updateRowCategory(item.id, event.target.value)}
                                >
                                  {categories.map((categoryOption) => (
                                    <option key={categoryOption.value} value={categoryOption.value}>{categoryOption.label}</option>
                                  ))}
                                </select>
                                <button onClick={() => removeReviewRow(item.id)} className="w-8 h-8 rounded-md hover:bg-red-50 text-red-600 flex items-center justify-center">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                      <div className="flex items-center justify-between px-3 py-3 bg-stitch-surface-container-low">
                        <button onClick={addReviewRow} className="btn-outline text-sm flex items-center gap-2 py-2">
                          <Plus className="w-4 h-4" />
                          Thêm dòng
                        </button>
                        <div className="text-right">
                          <div className="text-xs uppercase font-semibold text-stitch-on-surface-variant">Tổng tiền từ bảng</div>
                          <div className="font-heading text-xl font-bold text-stitch-on-surface">{formatCurrency(computedTotal)}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="stitch-card p-3">
                    <h3 className="font-heading font-semibold text-base mb-2">Token chưa gán</h3>
                    <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                      {unassignedTokens.map((token) => (
                        <button
                          key={token.id}
                          draggable
                          onDragStart={() => setDraggedTokenId(token.id)}
                          className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold text-left ${tokenColor(token.class_name)}`}
                          title={`${token.class_name} ${(token.confidence * 100).toFixed(0)}%`}
                        >
                          <span className="block uppercase text-[10px] opacity-70">{token.class_name}</span>
                          <span>{token.text || "(trong)"}</span>
                        </button>
                      ))}
                      {!unassignedTokens.length && <p className="text-sm text-stitch-on-surface-variant">Tất cả token đã được gán vào bảng.</p>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {apiError && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{apiError}</div>}

            <div className="flex gap-3 pt-2">
              <button onClick={() => setStep("form")} className="flex-1 btn-outline">
                Quay lại
              </button>
              {!analysis ? (
                <button
                  onClick={applyReceiptAnalysis}
                  disabled={!receiptFile || isAnalyzing}
                  className="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isAnalyzing && <Loader2 className="w-4 h-4 animate-spin" />}
                  Phân tích
                </button>
              ) : (
                <button
                  onClick={() => {
                    setAmount(String(computedTotal));
                    setCategory(dominantCategory(reviewItems));
                    setStep("form");
                  }}
                  className="flex-1 btn-primary"
                >
                  Áp dụng vào giao dịch
                </button>
              )}
            </div>
          </div>
        )}

        {step === "form" && (
          <div className="p-6 space-y-5">
            <div className="flex gap-2 bg-stitch-surface-container p-1 rounded-lg">
              {(["expense", "income"] as TxType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setTxType(type)}
                  className={`flex-1 py-2 rounded-lg text-base font-semibold transition-all ${txType === type
                    ? type === "expense"
                      ? "bg-white shadow-soft text-red-600"
                      : "bg-white shadow-soft text-green-600"
                    : "text-stitch-on-surface-variant"
                    }`}
                >
                  {type === "expense" ? "Chi tiêu" : "Thu nhập"}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-stitch-on-surface-variant uppercase tracking-wide">Số tiền (VND)</label>
              <div className="relative">
                <input
                  type="number"
                  placeholder="0"
                  value={computedTotal ? computedTotal : amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="stitch-input pr-16 text-2xl font-bold font-heading tabular-nums"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-stitch-on-surface-variant font-medium">VND</span>
              </div>
              {reviewItems.length > 0 && (
                <p className="text-xs text-stitch-on-surface-variant">
                  Số tiền được tính từ bảng item và sẽ cập nhật theo chế độ đơn giá hoặc thành tiền bạn chọn.
                </p>
              )}
            </div>

            <div className={`grid grid-cols-1 ${txType === "expense" ? "md:grid-cols-2" : ""} gap-3`}>
              {txType === "expense" && (
                <label className="space-y-1.5">
                  <span className="text-sm font-semibold text-stitch-on-surface-variant uppercase tracking-wide">Tên món hàng</span>
                  <input
                    value={itemName}
                    onChange={(event) => setItemName(event.target.value)}
                    className="stitch-input"
                    placeholder="Ví dụ: Bách Hóa Xanh, cơm trưa..."
                  />
                </label>
              )}
              <label className="space-y-1.5">
                <span className="text-sm font-semibold text-stitch-on-surface-variant uppercase tracking-wide">Ngày</span>
                <input type="date" value={transactionDate} onChange={(event) => setTransactionDate(event.target.value)} className="stitch-input" />
              </label>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-stitch-on-surface-variant uppercase tracking-wide">Danh mục</label>
              <div className="relative">
                <select value={category} onChange={(event) => setCategory(event.target.value)} className="stitch-input appearance-none pr-10">
                  {categories.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stitch-on-surface-variant pointer-events-none" />
              </div>
            </div>

            {txType === "expense" && (
              <button
                onClick={() => setStep("receipt")}
                className="w-full flex items-center gap-3 p-4 rounded-lg border border-dashed border-stitch-outline-variant text-left hover:border-brand-blue hover:bg-blue-50/40 transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-stitch-surface-container flex items-center justify-center flex-shrink-0">
                  {receiptPreview ? <img src={receiptPreview} alt="" className="w-10 h-10 rounded-lg object-cover" /> : <Camera className="w-5 h-5 text-stitch-on-surface-variant" />}
                </div>
                <div className="flex-1">
                  <p className="text-base font-semibold text-stitch-on-surface">{receiptPreview ? "Hóa đơn đã sẵn sàng" : "Thêm hóa đơn / chụp ảnh"}</p>
                  <p className="text-sm text-stitch-on-surface-variant">{analysis ? "Nhấn để kéo thả và chỉnh sửa các dòng hàng" : "YOLO detect vùng chữ, VietOCR đọc text, bạn review trước khi lưu"}</p>
                </div>
                <Upload className="w-4 h-4 text-stitch-on-surface-variant" />
              </button>
            )}

            {apiError && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{apiError}</div>}

            <div className="flex gap-3 pt-1">
              <button onClick={resetAndClose} className="flex-1 btn-outline">Hủy</button>
              <button
                onClick={handleSave}
                disabled={!(computedTotal || amount) || !category || isSaving}
                className="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Đang lưu...
                  </>
                ) : (
                  "Lưu Giao Dịch"
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
