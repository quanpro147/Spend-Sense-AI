import { useCallback, useEffect, useState } from "react";

interface ApiDataState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

interface ApiDataOptions {
  cacheKey?: string;
  staleMs?: number;
}

const apiDataCache = new Map<string, { data: unknown; expiresAt: number }>();

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Đã xảy ra lỗi không xác định.";
}

/**
 * Load data from an async loader, exposing loading/error state and a reload().
 * The loader is invoked on mount and whenever `deps` change.
 */
export function useApiData<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
  options: ApiDataOptions = {},
): ApiDataState<T> {
  const cached = getCachedData<T>(options.cacheKey);
  const [data, setData] = useState<T | null>(cached);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    const cachedResult = getCachedData<T>(options.cacheKey);
    if (cachedResult && nonce === 0) {
      setData(cachedResult);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading((current) => current || !data);
    setError(null);
    loader()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setCachedData(options.cacheKey, result, options.staleMs);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, options.cacheKey]);

  return { data, loading, error, reload };
}

function getCachedData<T>(cacheKey?: string): T | null {
  if (!cacheKey) return null;
  const entry = apiDataCache.get(cacheKey);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    apiDataCache.delete(cacheKey);
    return null;
  }
  return entry.data as T;
}

function setCachedData<T>(cacheKey: string | undefined, data: T, staleMs = 120_000): void {
  if (!cacheKey) return;
  apiDataCache.set(cacheKey, {
    data,
    expiresAt: Date.now() + staleMs,
  });
}
