import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Sparkles, X } from "lucide-react";
import { useApiData } from "@/hooks/useApiData";
import { listInsights, type InsightRecord } from "@/lib/api";

const SEEN_KEY = "notifications:seenIds";

function loadSeenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? new Set(parsed.filter((x): x is string => typeof x === "string")) : new Set();
  } catch {
    return new Set();
  }
}

export function NotificationBell() {
  const { data: insights } = useApiData<InsightRecord[]>(() => listInsights());
  const [open, setOpen] = useState(false);
  const [seenIds, setSeenIds] = useState<Set<string>>(loadSeenIds);
  const containerRef = useRef<HTMLDivElement>(null);

  const notifications = useMemo(() => insights ?? [], [insights]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !seenIds.has(n.insight_id)).length,
    [notifications, seenIds]
  );

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const markAllSeen = () => {
    const all = new Set(notifications.map((n) => n.insight_id));
    setSeenIds(all);
    localStorage.setItem(SEEN_KEY, JSON.stringify([...all]));
  };

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unreadCount > 0) markAllSeen();
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={handleToggle}
        aria-label="Thông báo"
        aria-haspopup="true"
        aria-expanded={open}
        className="relative w-9 h-9 rounded-full flex items-center justify-center text-stitch-on-surface-variant hover:bg-stitch-surface-container transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-xl border border-stitch-outline-variant shadow-lg z-40 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-stitch-outline-variant">
            <span className="font-heading font-semibold text-sm text-stitch-on-surface">
              Thông báo
            </span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Đóng"
              className="text-stitch-on-surface-variant hover:text-stitch-on-surface transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-stitch-on-surface-variant">
                Chưa có thông báo nào
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.insight_id}
                  className="flex gap-3 px-4 py-3 border-b border-stitch-outline-variant last:border-b-0 transition-colors hover:bg-stitch-surface-container-low"
                >
                  <div className="w-8 h-8 rounded-lg bg-stitch-primary-container flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-4 h-4 text-stitch-on-primary-container" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-stitch-on-primary-container bg-stitch-primary-container rounded px-1.5 py-0.5">
                        {n.category}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-stitch-on-surface leading-snug mt-1">
                      {n.summary}
                    </p>
                    {n.tips.length > 0 && (
                      <p className="text-xs text-stitch-on-surface-variant mt-1 line-clamp-2">
                        💡 {n.tips[0]}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
