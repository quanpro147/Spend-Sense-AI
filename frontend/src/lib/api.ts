const ENV_API_URL = import.meta.env.VITE_API_URL as string | undefined;
const REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_TIMEOUT_MS ?? 15000);
const RECEIPT_ANALYZE_TIMEOUT_MS = Number(import.meta.env.VITE_RECEIPT_TIMEOUT_MS ?? 120000);
const API_URLS = ENV_API_URL
  ? [ENV_API_URL]
  : ["http://localhost:8080", "http://127.0.0.1:8080"];
export const TOKEN_KEY = "spendsense_token";
export const USER_KEY = "spendsense_user";

export interface AuthUser {
  id: string;
  email: string;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  user: AuthUser;
}

export interface AnalyzeReceiptResult {
  insight: {
    insight_id: string;
    receipt_id: string;
    summary: string;
    category: string;
    tips: string[];
    source: "cache" | "llm";
    similarity_score: number | null;
  };
  vector_id: string | null;
  receipt: ReceiptDraft | null;
  suggested_transaction: SuggestedTransaction | null;
  detected_fields: DetectedField[];
}

export interface DetectedField {
  id: string;
  class_name: string;
  text: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ReceiptDraftItem {
  id: string;
  name: string;
  quantity: number;
  unit_price: number;
  discount: number;
  total_price: number;
  category: string;
  source_token_ids: Record<string, string | null>;
}

export interface ReceiptDraft {
  receipt_id: string;
  merchant: string;
  purchase_date: string | null;
  total_amount: number;
  currency: string;
  raw_text: string;
  items: ReceiptDraftItem[];
}

export interface SuggestedTransaction {
  type: "expense" | "income";
  amount: number;
  currency: string;
  category: string;
  description: string;
  merchant: string;
  transaction_date: string | null;
  receipt_id: string | null;
}

export interface CreateTransactionPayload {
  type: "expense" | "income";
  amount: number;
  currency: string;
  category: string;
  description: string;
  merchant: string;
  transaction_date: string | null;
  receipt_items: Array<{
    name: string;
    quantity: number;
    unit_price: number;
    category: string;
  }>;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithFallback(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function getHealth(): Promise<{ status: string }> {
  return request<{ status: string }>("/health");
}

export async function loginWithPassword(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function registerWithPassword(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function loginWithGoogle(credential: string): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/google", {
    method: "POST",
    body: JSON.stringify({ credential }),
  });
}

export async function getCurrentUser(token: string): Promise<AuthUser> {
  return request<AuthUser>("/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function analyzeReceipt(file: File): Promise<AnalyzeReceiptResult> {
  return postReceipt(file);
}

export async function createTransaction(payload: CreateTransactionPayload): Promise<unknown> {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) throw new Error("Bạn cần đăng nhập trước khi lưu giao dịch.");
  return request<unknown>("/transactions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

async function postReceipt(file: File): Promise<AnalyzeReceiptResult> {
  const form = new FormData();
  form.append("file", file);

  const response = await fetchWithFallback("/receipts/analyze", {
    method: "POST",
    body: form,
  }, {
    timeoutMs: RECEIPT_ANALYZE_TIMEOUT_MS,
    timeoutMessage: "Backend đang xử lý OCR/AI quá lâu. Hãy thử lại với ảnh rõ hơn hoặc tăng VITE_RECEIPT_TIMEOUT_MS.",
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Analyze failed: ${response.status}`);
  }

  return response.json() as Promise<AnalyzeReceiptResult>;
}

async function fetchWithFallback(
  path: string,
  init?: RequestInit,
  options?: { timeoutMs?: number; timeoutMessage?: string },
): Promise<Response> {
  let lastError: unknown;
  const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS;
  for (const baseUrl of API_URLS) {
    const controller = new AbortController();
    let didTimeout = false;
    const timeoutId = window.setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, timeoutMs);
    try {
      return await fetch(`${baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      lastError = error;
      if (didTimeout) {
        const seconds = Math.round(timeoutMs / 1000);
        throw new Error(options?.timeoutMessage ?? `Backend xử lý quá ${seconds} giây. Vui lòng thử lại.`);
      }
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  throw new Error(
    `Không kết nối được backend. Hãy chạy FastAPI ở một trong các cổng: ${API_URLS.join(", ")}. ` +
    `Lỗi gốc: ${lastError instanceof Error ? lastError.message : "Failed to fetch"}`,
  );
}


// ---------------------------------------------------------------------------
// Investment APIs
// ---------------------------------------------------------------------------

export interface InvestmentProfile {
  id: string;
  user_id: string;
  risk_appetite: string;
  capital: number;
  goal: string;
  updated_at: string;
}

export interface InvestmentAsset {
  id: string;
  user_id: string;
  symbol: string;
  name: string;
  type: 'stock' | 'gold' | 'saving' | 'crypto';
  quantity: number;
  purchase_price: number;
  current_price?: number;
  value?: number;
  profit?: number;
  profit_percent?: number;
  color: string;
  updated_at: string;
}

export interface ScenarioResult {
  id: string;
  name: string;
  simulated_value: number;
  loss_value: number;
  loss_percent: number;
}

export interface HedgingStrategy {
  asset: string;
  action: string;
  amount: number;
  reasoning: string;
}

export interface StressTestResult {
  portfolio_value: number;
  total_capital: number;
  idle_cash: number;
  vulnerability_score: number;
  diversification_score: number;
  worst_scenario: string;
  worst_loss_percent: number;
  scenarios: ScenarioResult[];
  assets: InvestmentAsset[];
  overall_analysis: string;
  hedging_strategies: HedgingStrategy[];
}

export async function getInvestmentProfile(): Promise<InvestmentProfile> {
  const token = localStorage.getItem(TOKEN_KEY);
  return request<InvestmentProfile>("/investment/profile", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

export async function saveInvestmentProfile(payload: {
  risk_appetite: string;
  capital: number;
  goal: string;
}): Promise<InvestmentProfile> {
  const token = localStorage.getItem(TOKEN_KEY);
  return request<InvestmentProfile>("/investment/profile", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(payload),
  });
}

export async function getPortfolio(): Promise<InvestmentAsset[]> {
  const token = localStorage.getItem(TOKEN_KEY);
  return request<InvestmentAsset[]>("/investment/portfolio", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

export async function addAsset(payload: {
  symbol: string;
  name: string;
  type: string;
  quantity: number;
  purchase_price: number;
  color?: string;
}): Promise<InvestmentAsset> {
  const token = localStorage.getItem(TOKEN_KEY);
  return request<InvestmentAsset>("/investment/portfolio", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(payload),
  });
}

export async function deleteAsset(assetId: string): Promise<void> {
  const token = localStorage.getItem(TOKEN_KEY);
  const response = await fetchWithFallback(`/investment/portfolio/${assetId}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Delete asset failed: ${response.status}`);
  }
}

export async function getStressTest(): Promise<StressTestResult> {
  const token = localStorage.getItem(TOKEN_KEY);
  return request<StressTestResult>("/investment/stress-test", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}


// ---------------------------------------------------------------------------
// Transactions, insights, goals, preferences APIs
// ---------------------------------------------------------------------------

function authHeader(): Record<string, string> {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface TransactionRecord {
  id: string;
  user_id: string;
  receipt_id: string | null;
  type: "expense" | "income";
  amount: number;
  currency: string;
  category: string;
  description: string;
  merchant: string;
  transaction_date: string | null;
  created_at: string;
  updated_at: string;
}

interface TransactionListResponse {
  items: TransactionRecord[];
  total: number;
  limit: number;
  offset: number;
}

export async function listTransactions(limit = 200, offset = 0): Promise<TransactionRecord[]> {
  const res = await request<TransactionListResponse>(
    `/transactions?limit=${limit}&offset=${offset}`,
    { headers: authHeader() },
  );
  return res.items;
}

export interface InsightRecord {
  insight_id: string;
  receipt_id: string;
  summary: string;
  category: string;
  tips: string[];
  source: "cache" | "llm";
  similarity_score: number | null;
}

interface InsightListResponse {
  items: InsightRecord[];
  total: number;
  limit: number;
  offset: number;
}

export async function listInsights(limit = 50, offset = 0): Promise<InsightRecord[]> {
  const res = await request<InsightListResponse>(
    `/insights?limit=${limit}&offset=${offset}`,
    { headers: authHeader() },
  );
  return res.items;
}

export interface GoalRecord {
  id: string;
  user_id: string;
  title: string;
  emoji: string;
  target_amount: number;
  current_amount: number;
  monthly_target: number;
  deadline: string | null;
  ai_note: string;
  status: "on-track" | "at-risk" | "achieved";
  progress_percent: number;
  created_at: string;
  updated_at: string;
}

export interface GoalInput {
  title: string;
  emoji?: string;
  target_amount: number;
  current_amount?: number;
  monthly_target?: number;
  deadline?: string | null;
  ai_note?: string;
}

export async function listGoals(): Promise<GoalRecord[]> {
  const res = await request<{ items: GoalRecord[]; total: number }>("/goals", {
    headers: authHeader(),
  });
  return res.items;
}

export async function createGoal(payload: GoalInput): Promise<GoalRecord> {
  return request<GoalRecord>("/goals", {
    method: "POST",
    headers: authHeader(),
    body: JSON.stringify(payload),
  });
}

export async function updateGoal(goalId: string, payload: Partial<GoalInput>): Promise<GoalRecord> {
  return request<GoalRecord>(`/goals/${goalId}`, {
    method: "PATCH",
    headers: authHeader(),
    body: JSON.stringify(payload),
  });
}

export async function deleteGoal(goalId: string): Promise<void> {
  const response = await fetchWithFallback(`/goals/${goalId}`, {
    method: "DELETE",
    headers: authHeader(),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Delete goal failed: ${response.status}`);
  }
}

export interface PreferencesRecord {
  user_id: string;
  weekly_report: boolean;
  rebalance_suggestions: boolean;
  anomaly_alerts: boolean;
  goal_reminders: boolean;
  updated_at: string;
}

export type PreferenceKey =
  | "weekly_report"
  | "rebalance_suggestions"
  | "anomaly_alerts"
  | "goal_reminders";

export async function getPreferences(): Promise<PreferencesRecord> {
  return request<PreferencesRecord>("/preferences", { headers: authHeader() });
}

export async function updatePreferences(
  payload: Partial<Record<PreferenceKey, boolean>>,
): Promise<PreferencesRecord> {
  return request<PreferencesRecord>("/preferences", {
    method: "PUT",
    headers: authHeader(),
    body: JSON.stringify(payload),
  });
}

