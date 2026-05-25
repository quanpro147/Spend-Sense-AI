import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (response: { credential?: string }) => void }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

export function LoginPage() {
  const { login, register, loginGoogle } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const googleButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!googleClientId || !googleButtonRef.current) return;

    const renderGoogleButton = () => {
      if (!window.google || !googleButtonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response) => {
          if (!response.credential) return;
          setLoading(true);
          setError("");
          try {
            await loginGoogle(response.credential);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Không thể đăng nhập Google.");
          } finally {
            setLoading(false);
          }
        },
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline",
        size: "large",
        shape: "rectangular",
        text: "continue_with",
        width: 360,
      });
    };

    if (window.google) {
      renderGoogleButton();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = renderGoogleButton;
    document.head.appendChild(script);
  }, [loginGoogle]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể đăng nhập.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-md bg-white rounded-xl border border-stitch-outline-variant shadow-card p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-lg bg-stitch-primary-container flex items-center justify-center shadow-ai-glow">
            <Sparkles className="w-6 h-6 text-stitch-on-primary-container" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold text-stitch-on-surface">SpendSenseAI</h1>
            <p className="text-sm text-stitch-on-surface-variant">Đăng nhập để quản lý tài chính của bạn.</p>
          </div>
        </div>

        <div className="flex gap-2 bg-stitch-surface-container p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`flex-1 py-2 rounded-lg font-semibold transition-all ${mode === "login" ? "bg-white shadow-soft text-stitch-on-surface" : "text-stitch-on-surface-variant"}`}
          >
            Đăng nhập
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            className={`flex-1 py-2 rounded-lg font-semibold transition-all ${mode === "register" ? "bg-white shadow-soft text-stitch-on-surface" : "text-stitch-on-surface-variant"}`}
          >
            Tạo tài khoản
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="space-y-1.5 block">
            <span className="text-sm font-semibold text-stitch-on-surface-variant uppercase tracking-wide">Email</span>
            <input className="stitch-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label className="space-y-1.5 block">
            <span className="text-sm font-semibold text-stitch-on-surface-variant uppercase tracking-wide">Mật khẩu</span>
            <input className="stitch-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required />
          </label>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <button className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60" disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}
          </button>
        </form>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-stitch-outline-variant" />
          <span className="text-xs font-semibold text-stitch-on-surface-variant">HOẶC</span>
          <div className="h-px flex-1 bg-stitch-outline-variant" />
        </div>

        {googleClientId ? (
          <div className="flex justify-center" ref={googleButtonRef} />
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Chưa cấu hình VITE_GOOGLE_CLIENT_ID.
          </div>
        )}
      </div>
    </div>
  );
}
