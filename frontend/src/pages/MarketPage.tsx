import { useEffect, useRef, useState } from "react";
import type React from "react";
import {
  Coins,
  ExternalLink,
  Globe2,
  Newspaper,
  RefreshCw,
} from "lucide-react";
import {
  getMarketIntelligence,
  getVNStocks,
  type MarketIntelligence,
  type MarketSymbol,
  type VNMarketGroup,
  type VNMarketSort,
} from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { formatDate } from "@/lib/utils";

interface TradingViewWidgetProps {
  scriptSrc: string;
  config: Record<string, unknown>;
  className?: string;
}

const VN_MARKET_PRESETS = [
  { label: "Tất cả", group: "all" },
  { label: "VN30", group: "vn30" },
  { label: "Ngân hàng", group: "bank" },
  { label: "Chứng khoán", group: "securities" },
  { label: "Bất động sản", group: "real_estate" },
  { label: "Bán lẻ", group: "retail" },
  { label: "Thép", group: "steel" },
];

type VNSortKey = VNMarketSort;
type VNSortColumn = "symbol" | "price" | "change" | "percent";
type VNSortDirection = "asc" | "desc";

const CRYPTO_HEATMAP_CONFIG = {
  dataSource: "Crypto",
  blockSize: "market_cap_calc",
  blockColor: "change",
  locale: "vi_VN",
  symbolUrl: "",
  colorTheme: "light",
  hasTopBar: false,
  isDataSetEnabled: false,
  isZoomEnabled: true,
  hasSymbolTooltip: true,
  width: "100%",
  height: "100%",
};

const SP500_HEATMAP_CONFIG = {
  dataSource: "SPX500",
  blockSize: "market_cap_basic",
  blockColor: "change",
  grouping: "sector",
  locale: "vi_VN",
  colorTheme: "light",
  hasTopBar: false,
  isDataSetEnabled: false,
  isZoomEnabled: true,
  hasSymbolTooltip: true,
  width: "100%",
  height: "100%",
};

function TradingViewWidget({ scriptSrc, config, className = "" }: Readonly<TradingViewWidgetProps>) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = '<div class="tradingview-widget-container__widget"></div>';
    const script = document.createElement("script");
    script.src = scriptSrc;
    script.async = true;
    script.type = "text/javascript";
    script.text = JSON.stringify(config);
    ref.current.appendChild(script);
  }, [config, scriptSrc]);

  return <div ref={ref} className={`tradingview-widget-container h-full w-full ${className}`} />;
}

function TradingViewPanel({
  title,
  children,
  heightClass = "h-[300px]",
}: Readonly<{ title: string; children: React.ReactNode; heightClass?: string }>) {
  return (
    <div className="stitch-card p-lg min-h-[360px]">
      <h3 className="section-title mb-lg">{title}</h3>
      <div className={heightClass}>{children}</div>
    </div>
  );
}

function MarketSnapshot({
  data,
  onRefresh,
}: Readonly<{
  data: MarketIntelligence;
  onRefresh: () => void;
}>) {
  const context = data.market_context;

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-h2-kpi text-stitch-on-surface">Tin tức mới nhất</h1>
          <p className="text-body-lg text-stitch-on-surface-variant mt-1">
            Dữ liệu được lấy trực tiếp từ vnstock, CoinGecko, Stooq và Vietstock RSS.
          </p>
        </div>
        <button onClick={onRefresh} className="btn-outline flex items-center gap-2 w-fit">
          <RefreshCw className="w-4 h-4" />
          Làm mới
        </button>
      </div>

      

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-lg">
        <GlobalMarketPanel data={context.global_market.indices} error={context.global_market.error} />
        <CryptoDataPanel data={context.crypto_market.majors} error={context.crypto_market.error} />
      </div>

      <MarketNewsPanel items={context.news.items} error={context.news.error} />
    </div>
  );
}

function GlobalMarketPanel({
  data,
  error,
}: Readonly<{ data: MarketIntelligence["market_context"]["global_market"]["indices"]; error: string | null }>) {
  return (
    <section className="stitch-card p-lg">
      <div className="flex items-center gap-2 mb-lg">
        <Globe2 className="w-5 h-5 text-brand-blue-dark" />
        <h3 className="section-title">Chỉ Số Quốc Tế</h3>
      </div>
      {error && <p className="text-sm text-danger mb-3">{error}</p>}
      <div className="space-y-3">
        {data.map((item) => (
          <div key={item.symbol} className="flex items-center justify-between gap-4 border-b border-stitch-outline-variant pb-3 last:border-0 last:pb-0">
            <div>
              <div className="font-semibold text-stitch-on-surface">{item.symbol}</div>
              <div className="text-xs text-stitch-on-surface-variant">{item.source}</div>
            </div>
            <div className="text-right">
              <div className="font-semibold">{formatNumber(item.price)}</div>
              <div className={`text-sm ${changeTextClass(item.change_percent)}`}>{formatChangePercent(item.change_percent)}</div>
            </div>
          </div>
        ))}
        {!data.length && !error && <p className="text-sm text-stitch-on-surface-variant">Chưa có dữ liệu chỉ số quốc tế.</p>}
      </div>
    </section>
  );
}

function CryptoDataPanel({
  data,
  error,
}: Readonly<{ data: MarketIntelligence["market_context"]["crypto_market"]["majors"]; error: string | null }>) {
  return (
    <section className="stitch-card p-lg">
      <div className="flex items-center gap-2 mb-lg">
        <Coins className="w-5 h-5 text-brand-blue-dark" />
        <h3 className="section-title">Dữ liệu Crypto</h3>
      </div>
      {error && <p className="text-sm text-danger mb-3">{error}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {data.map((item) => (
          <div key={item.symbol} className="rounded-lg bg-stitch-surface-container-low p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-stitch-on-surface">{item.symbol}</div>
                <div className="text-xs text-stitch-on-surface-variant">{item.name}</div>
              </div>
              <div className={`text-sm font-semibold ${changeTextClass(item.change_percent_24h)}`}>
                {formatChangePercent(item.change_percent_24h)}
              </div>
            </div>
            <div className="mt-3 font-heading text-xl font-semibold">${formatNumber(item.price_usd)}</div>
            <div className="mt-1 text-xs text-stitch-on-surface-variant">Vol 24h: ${formatCompactNumber(item.volume_24h_usd)}</div>
          </div>
        ))}
        {!data.length && !error && <p className="text-sm text-stitch-on-surface-variant">Chưa có dữ liệu crypto.</p>}
      </div>
    </section>
  );
}

function MarketNewsPanel({
  items,
  error,
}: Readonly<{ items: MarketIntelligence["market_context"]["news"]["items"]; error: string | null }>) {
  return (
    <section className="stitch-card p-lg">
      <div className="flex items-center gap-2 mb-lg">
        <Newspaper className="w-5 h-5 text-brand-blue-dark" />
        <h3 className="section-title">Tin Thị Trường</h3>
      </div>
      {error && <p className="text-sm text-danger mb-3">{error}</p>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {items.map((item) => (
          <article key={item.url} className="rounded-lg border border-stitch-outline-variant p-4">
            <div className="flex items-center justify-between gap-3 text-xs text-stitch-on-surface-variant mb-2">
              <span>{item.source} · {item.category}</span>
              <span>{item.published_at ? formatDate(item.published_at) : "-"}</span>
            </div>
            <h4 className="font-semibold text-stitch-on-surface leading-snug">{item.title}</h4>
            {item.summary && <p className="text-sm text-stitch-on-surface-variant mt-2 line-clamp-3">{item.summary}</p>}
            <a href={item.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-blue-dark">
              Mở bài gốc <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </article>
        ))}
        {!items.length && !error && <p className="text-sm text-stitch-on-surface-variant">Chưa có tin thị trường.</p>}
      </div>
    </section>
  );
}

function VietnamMarketTable({
  data,
  loading,
  error,
  onRefresh,
  onGroupChange,
  onSortChange,
  activeGroup,
  sortKey,
}: Readonly<{
  data: MarketSymbol[] | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onGroupChange: (group: VNMarketGroup) => void;
  onSortChange: (sort: VNSortKey) => void;
  activeGroup: VNMarketGroup;
  sortKey: VNSortKey;
}>) {
  const visibleRows = (data ?? []).filter((item) => item.price !== null && !item.error);
  const advancingCount = visibleRows.filter((item) => (item.change_percent ?? 0) > 0).length;
  const decliningCount = visibleRows.filter((item) => (item.change_percent ?? 0) < 0).length;
  const avgChange = visibleRows.length
    ? visibleRows.reduce((sum, item) => sum + (item.change_percent ?? 0), 0) / visibleRows.length
    : null;
  const strongest = visibleRows.find((item) => item.change_percent !== null);
  const weakest = [...visibleRows].sort((a, b) => (a.change_percent ?? 0) - (b.change_percent ?? 0)).find((item) => item.change_percent !== null);
  const activeSortColumn = getSortColumn(sortKey);
  const activeSortDirection = getSortDirection(sortKey);

  const requestSort = (column: VNSortColumn) => {
    const nextDirection: VNSortDirection =
      activeSortColumn === column && activeSortDirection === "desc" ? "asc" : "desc";
    onSortChange(toSortKey(column, nextDirection));
  };

  return (
    <section className="stitch-card p-lg">
      <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4 mb-lg">
        <div>
          <h3 className="section-title">Thị trường Việt Nam</h3>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full xl:w-auto">
          <button onClick={onRefresh} className="btn-outline flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Làm mới
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-lg">
        {VN_MARKET_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => onGroupChange(preset.group as VNMarketGroup)}
            className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
              activeGroup === preset.group
                ? "border-brand-blue bg-blue-50 text-brand-blue-dark"
                : "border-stitch-outline-variant text-stitch-on-surface hover:border-brand-blue"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-lg">
        <MarketMiniStat label="Mã có dữ liệu" value={`${visibleRows.length}`} />
        <MarketMiniStat label="Tăng / Giảm" value={`${advancingCount}/${decliningCount}`} tone={advancingCount >= decliningCount ? "positive" : "negative"} />
        <MarketMiniStat label="Biến động TB" value={formatChangePercent(avgChange)} tone={(avgChange ?? 0) >= 0 ? "positive" : "negative"} />
        <MarketMiniStat label="Mạnh nhất / Yếu nhất" value={strongest && weakest ? `${strongest.symbol} / ${weakest.symbol}` : "-"} />
      </div>

      {loading && <div className="py-10 text-center text-stitch-on-surface-variant">Đang tải bảng giá Việt Nam...</div>}
      {error && <div className="py-8 text-danger">{error}</div>}
      {!loading && !error && !visibleRows.length && (
        <div className="py-10 text-center text-stitch-on-surface-variant">
          Chưa có mã nào lấy được dữ liệu giá. Hãy thử mã khác hoặc kiểm tra nguồn vnstock/FireAnt.
        </div>
      )}
      {!loading && !error && visibleRows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-stitch-outline-variant text-left text-stitch-on-surface-variant">
                <th className="py-3 pr-4 font-semibold">
                  <SortableHeader
                    label="Mã"
                    active={activeSortColumn === "symbol"}
                    direction={activeSortDirection}
                    onClick={() => requestSort("symbol")}
                  />
                </th>
                <th className="py-3 pr-4 font-semibold">Tên</th>
                <th className="py-3 pr-4 font-semibold text-right">
                  <SortableHeader
                    label="Giá"
                    active={activeSortColumn === "price"}
                    direction={activeSortDirection}
                    onClick={() => requestSort("price")}
                    align="right"
                  />
                </th>
                <th className="py-3 pr-4 font-semibold text-right" title="Mức thay đổi so với giá tham chiếu hoặc giá đóng cửa phiên trước tùy nguồn dữ liệu.">
                  <SortableHeader
                    label="+/- so với TC"
                    active={activeSortColumn === "change"}
                    direction={activeSortDirection}
                    onClick={() => requestSort("change")}
                    align="right"
                  />
                </th>
                <th className="py-3 pr-4 font-semibold text-right" title="Phần trăm thay đổi so với giá tham chiếu hoặc giá đóng cửa phiên trước tùy nguồn dữ liệu.">
                  <SortableHeader
                    label="% so với TC"
                    active={activeSortColumn === "percent"}
                    direction={activeSortDirection}
                    onClick={() => requestSort("percent")}
                    align="right"
                  />
                </th>
                <th className="py-3 pr-4 font-semibold">Cập nhật</th>
                <th className="py-3 font-semibold">Nguồn</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((item) => (
                <tr key={item.symbol} className="border-b border-stitch-outline-variant last:border-0">
                  <td className="py-3 pr-4 font-semibold text-stitch-on-surface">{item.symbol}</td>
                  <td className="py-3 pr-4 text-stitch-on-surface-variant">{item.name}</td>
                  <td className="py-3 pr-4 text-right font-semibold">{item.price === null ? "Không có dữ liệu" : formatPrice(item)}</td>
                  <td className={`py-3 pr-4 text-right ${changeTextClass(item.change)}`}>{formatSignedNumber(item.change)}</td>
                  <td className={`py-3 pr-4 text-right ${changeTextClass(item.change_percent)}`}>{formatChangePercent(item.change_percent)}</td>
                  <td className="py-3 pr-4 text-stitch-on-surface-variant">{item.updated_at ? formatDate(item.updated_at) : "-"}</td>
                  <td className="py-3 text-stitch-on-surface-variant">{item.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function MarketMiniStat({
  label,
  value,
  tone = "neutral",
}: Readonly<{ label: string; value: string; tone?: "neutral" | "positive" | "negative" }>) {
  const toneClass = tone === "positive" ? "text-success" : tone === "negative" ? "text-danger" : "text-stitch-on-surface";
  return (
    <div className="rounded-lg bg-stitch-surface-container-low p-4">
      <div className="text-xs text-stitch-on-surface-variant">{label}</div>
      <div className={`font-heading text-xl font-semibold mt-1 ${toneClass}`}>{value}</div>
    </div>
  );
}

function SortableHeader({
  label,
  active,
  direction,
  onClick,
  align = "left",
}: Readonly<{
  label: string;
  active: boolean;
  direction: VNSortDirection;
  onClick: () => void;
  align?: "left" | "right";
}>) {
  const arrow = active ? (direction === "asc" ? "↑" : "↓") : "↕";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 font-semibold transition-colors hover:text-brand-blue-dark ${
        align === "right" ? "justify-end w-full" : ""
      } ${active ? "text-brand-blue-dark" : ""}`}
    >
      <span>{label}</span>
      <span className="text-xs">{arrow}</span>
    </button>
  );
}

export function MarketPage() {
  const overview = useApiData(
    () => getMarketIntelligence(),
    [],
    { cacheKey: "market-overview", staleMs: 5 * 60 * 1000 },
  );
  const [vnGroup, setVnGroup] = useState<VNMarketGroup>("all");
  const [vnSort, setVnSort] = useState<VNMarketSort>("percent_desc");
  const vnMarket = useApiData(
    () => getVNStocks(vnGroup, vnSort, 10),
    [vnGroup, vnSort],
    { cacheKey: `vn-market-${vnGroup}-${vnSort}`, staleMs: 2 * 60 * 1000 },
  );

  const refreshAll = () => {
    overview.reload();
    vnMarket.reload();
  };

  if (overview.loading && !overview.data) {
    return <div className="py-20 text-center text-stitch-on-surface-variant">Đang tải tin tức...</div>;
  }

  if (overview.error || !overview.data) {
    return (
      <div className="py-20 text-center space-y-3">
        <p className="text-danger">{overview.error ?? "Không tải được dữ liệu thị trường."}</p>
        <button onClick={overview.reload} className="btn-outline">Thử lại</button>
      </div>
    );
  }

  return (
    <div className="space-y-xxl">
      <MarketSnapshot
        data={overview.data}
        onRefresh={refreshAll}
      />

      <VietnamMarketTable
        data={vnMarket.data}
        loading={vnMarket.loading}
        error={vnMarket.error}
        onRefresh={vnMarket.reload}
        onGroupChange={setVnGroup}
        onSortChange={setVnSort}
        activeGroup={vnGroup}
        sortKey={vnSort}
      />

      <TradingViewPanel title="Crypto Market" heightClass="h-[520px]">
        <TradingViewWidget
          scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-crypto-coins-heatmap.js"
          config={CRYPTO_HEATMAP_CONFIG}
        />
      </TradingViewPanel>

      <TradingViewPanel title="Heatmap S&P 500" heightClass="h-[520px]">
        <TradingViewWidget
          scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js"
          config={SP500_HEATMAP_CONFIG}
        />
      </TradingViewPanel>
    </div>
  );
}

function formatPrice(item: MarketSymbol): string {
  const suffix = item.currency === "POINT" ? " điểm" : " đ";
  return `${formatNumber(item.price)}${suffix}`;
}

function formatNumber(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: value > 1000 ? 0 : 2 }).format(value);
}

function formatCompactNumber(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("vi-VN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatSignedNumber(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value)}`;
}

function formatChangePercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function changeTextClass(value: number | null): string {
  if (value === null || Number.isNaN(value) || value === 0) return "text-stitch-on-surface-variant";
  return value > 0 ? "text-success" : "text-danger";
}

function getSortColumn(sortKey: VNSortKey): VNSortColumn {
  if (sortKey.startsWith("symbol")) return "symbol";
  if (sortKey.startsWith("price")) return "price";
  if (sortKey.startsWith("change")) return "change";
  return "percent";
}

function getSortDirection(sortKey: VNSortKey): VNSortDirection {
  return sortKey.endsWith("asc") ? "asc" : "desc";
}

function toSortKey(column: VNSortColumn, direction: VNSortDirection): VNSortKey {
  if (column === "symbol") return direction === "asc" ? "symbol_asc" : "symbol_desc";
  if (column === "price") return direction === "asc" ? "price_asc" : "price_desc";
  if (column === "change") return direction === "asc" ? "change_asc" : "change_desc";
  return direction === "asc" ? "percent_asc" : "percent_desc";
}
