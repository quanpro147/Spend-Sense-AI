import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  BarChart3,
  Target,
  TrendingUp,
  Settings,
  Plus,
  Bell,
  Sparkles,
  Zap,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AddTransactionModal } from "@/components/AddTransactionModal";
import { useAuth } from "@/lib/auth";

const navItems = [
  { label: "Tổng Quan", icon: LayoutDashboard, path: "/" },
  { label: "Phân Tích", icon: BarChart3, path: "/analytics" },
  { label: "Mục Tiêu", icon: Target, path: "/goals" },
  { label: "Đầu Tư", icon: TrendingUp, path: "/investment" },
  { label: "Cài Đặt", icon: Settings, path: "/settings" },
];

export function Sidebar({ onAddTx }: Readonly<{ onAddTx: () => void }>) {
  const { pathname } = useLocation();

  return (
    <aside className="hidden lg:flex flex-col fixed left-0 top-0 h-full w-64 bg-white border-r border-stitch-outline-variant z-30 px-4 py-6 gap-1">
      {/* Logo */}
      <div className="flex items-center gap-3 px-2 pb-6 border-b border-stitch-outline-variant mb-2">
        <div className="w-9 h-9 rounded-lg bg-stitch-primary-container flex items-center justify-center shadow-ai-glow">
          <Sparkles className="w-5 h-5 text-stitch-on-primary-container" />
        </div>
        <div>
          <div className="font-heading font-bold text-base text-stitch-on-surface leading-tight">
            SpendSenseAI
          </div>
          <div className="text-xs text-stitch-on-surface-variant leading-tight">AI Copilot</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5">
        {navItems.map((item) => {
          const active = item.path === "/" ? pathname === "/" : pathname.startsWith(item.path);
          return (
            <Link key={item.path} to={item.path}>
              <div className={cn("nav-link", active && "active")}>
                <item.icon className="w-5 h-5 flex-shrink-0" />
                <span>{item.label}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* AI Status pill */}
      <div className="bg-stitch-surface-container-low border border-stitch-secondary-container rounded-lg px-4 py-3 mb-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs font-semibold text-stitch-on-surface">AI Copilot hoạt động</span>
        </div>
        <p className="text-xs text-stitch-on-surface-variant">
          Phân tích tài chính của bạn mỗi ngày
        </p>
      </div>

      {/* CTA */}
      <button onClick={onAddTx} className="btn-primary w-full flex items-center justify-center gap-2">
        <Plus className="w-5 h-5" />
        Thêm Giao Dịch
      </button>
    </aside>
  );
}

export function TopBar({ onAddTx }: Readonly<{ onAddTx: () => void }>) {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const currentPage = navItems.find((i) =>
    i.path === "/" ? pathname === "/" : pathname.startsWith(i.path)
  );

  return (
    <header className="fixed top-0 left-0 lg:left-64 right-0 h-16 bg-white/90 backdrop-blur-sm border-b border-stitch-outline-variant z-20 flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-stitch-primary-container flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-stitch-on-primary-container" />
          </div>
          <span className="font-heading font-bold text-base text-stitch-on-surface">SpendSenseAI</span>
        </div>
        {/* Desktop page title */}
        <span className="hidden lg:block font-heading font-semibold text-lg text-stitch-on-surface">
          {currentPage?.label ?? ""}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {/* Mobile Add button */}
        <button
          onClick={onAddTx}
          className="lg:hidden flex items-center gap-1.5 bg-stitch-primary-container text-stitch-on-primary-container px-3 py-1.5 rounded-lg text-sm font-semibold active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" />
          Thêm
        </button>

        <button className="relative w-9 h-9 rounded-full flex items-center justify-center text-stitch-on-surface-variant hover:bg-stitch-surface-container transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
        </button>

        <button className="relative w-9 h-9 rounded-full flex items-center justify-center text-stitch-on-surface-variant hover:bg-stitch-surface-container transition-colors">
          <Zap className="w-5 h-5 text-stitch-primary-container" />
        </button>

        <div className="hidden sm:block text-right leading-tight">
          <div className="text-sm font-semibold text-stitch-on-surface">{user?.email}</div>
          <button onClick={logout} className="text-xs text-stitch-on-surface-variant hover:text-brand-blue-dark">
            Đăng xuất
          </button>
        </div>

        <button
          onClick={logout}
          className="w-9 h-9 rounded-full flex items-center justify-center text-stitch-on-surface-variant hover:bg-stitch-surface-container transition-colors"
          title="Đăng xuất"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}

export function BottomNav({ onAddTx }: Readonly<{ onAddTx: () => void }>) {
  const { pathname } = useLocation();
  const visibleItems = navItems.slice(0, 2);
  const visibleItems2 = navItems.slice(3);

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-stitch-outline-variant z-30 flex items-center">
      {visibleItems.map((item) => {
        const active = item.path === "/" ? pathname === "/" : pathname.startsWith(item.path);
        return (
          <Link key={item.path} to={item.path} className="flex-1">
            <div className={cn("flex flex-col items-center justify-center py-2 gap-1 transition-colors", active ? "text-brand-blue-dark" : "text-stitch-on-surface-variant")}>
              <item.icon className="w-5 h-5" />
              <span className="text-xs font-medium">{item.label}</span>
            </div>
          </Link>
        );
      })}
      {/* Center FAB */}
      <div className="flex-1 flex justify-center">
        <button
          onClick={onAddTx}
          className="w-12 h-12 rounded-full bg-stitch-primary-container text-stitch-on-primary-container flex items-center justify-center shadow-ai-glow active:scale-95 transition-all -mt-4"
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>
      {navItems.slice(2, 3).map((item) => {
        const active = pathname.startsWith(item.path);
        return (
          <Link key={item.path} to={item.path} className="flex-1">
            <div className={cn("flex flex-col items-center justify-center py-2 gap-1 transition-colors", active ? "text-brand-blue-dark" : "text-stitch-on-surface-variant")}>
              <item.icon className="w-5 h-5" />
              <span className="text-xs font-medium">{item.label}</span>
            </div>
          </Link>
        );
      })}
      {visibleItems2.map((item) => {
        const active = pathname.startsWith(item.path);
        return (
          <Link key={item.path} to={item.path} className="flex-1">
            <div className={cn("flex flex-col items-center justify-center py-2 gap-1 transition-colors", active ? "text-brand-blue-dark" : "text-stitch-on-surface-variant")}>
              <item.icon className="w-5 h-5" />
              <span className="text-xs font-medium">{item.label}</span>
            </div>
          </Link>
        );
      })}
    </nav>
  );
}

export function NavigationProvider() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <Sidebar onAddTx={() => setModalOpen(true)} />
      <TopBar onAddTx={() => setModalOpen(true)} />
      <BottomNav onAddTx={() => setModalOpen(true)} />
      <AddTransactionModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
