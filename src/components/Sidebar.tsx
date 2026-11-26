import React from 'react';
import {
  ShoppingBag,
  Package,
  Truck,
  Tag,
  BarChart3,
  BookOpen,
  Users,
  RotateCcw,
  Cloud,
  LogOut,
  X,
  Receipt,
  Menu,
} from 'lucide-react';
import { ActiveView } from '../types/pos';
import { usePos } from '../context/PosContext';
import { RoleCapability } from '../utils/posLogic';

interface SidebarProps {
  activeView: ActiveView;
  onSelectView: (view: ActiveView) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: Array<{
  id: ActiveView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  requiredCapability?: RoleCapability;
}> = [
  { id: 'pos', label: 'POS Register', icon: ShoppingBag },
  { id: 'sales', label: 'Sales Ledger', icon: Receipt },
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'purchases', label: 'Purchases', icon: Truck, requiredCapability: 'purchases' },
  { id: 'labels', label: 'Label Studio', icon: Tag },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'debts', label: 'Debt & Credit', icon: BookOpen },
  { id: 'staff', label: 'Users & Staff', icon: Users, requiredCapability: 'staff_admin' },
  { id: 'reset', label: 'System Reset', icon: RotateCcw, requiredCapability: 'system_reset' },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onSelectView,
  mobileOpen,
  onCloseMobile,
}) => {
  const {
    user,
    syncMode,
    currentUserRole,
    can,
    staff,
    activeLocalStaffId,
    switchLocalStaff,
    signInWithGoogle,
    signOutUser,
    debts,
    inventory,
  } = usePos();

  const openTabsCount = debts.filter((d) => d.status === 'open').length;
  const lowStockCount = inventory.filter((i) => i.quantity <= i.reorderLevel).length;
  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.requiredCapability || can(item.requiredCapability)
  );

  const content = (
    <div className="flex flex-col h-full bg-[#231712] text-[#FAF8F5] pb-safe">
      {/* Brand Header */}
      <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-lg bg-white p-1 flex items-center justify-center shrink-0">
            <img
              src="./assets/aistudio/image_89dfb75c.png"
              alt="ELA Jewelry"
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="min-w-0">
            <p className="font-display text-base font-semibold text-[#F7D87F] truncate leading-tight">
              ELA Jewelry
            </p>
            <p className="text-[11px] text-[#C8B9AE] truncate">Shared Boutique POS</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden min-w-[44px] min-h-[44px] flex items-center justify-center text-[#C8B9AE] hover:text-white rounded-lg cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation Links */}
      <nav aria-label="Main Navigation" className="flex-1 px-3 py-3.5 space-y-1 overflow-y-auto">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          let countHint: string | null = null;
          if (item.id === 'debts' && openTabsCount > 0) countHint = `${openTabsCount}`;
          if (item.id === 'inventory' && lowStockCount > 0) countHint = `${lowStockCount} low`;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectView(item.id);
                onCloseMobile();
              }}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-center justify-between gap-3 px-3.5 min-h-[44px] lg:min-h-0 lg:py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-[#BE1A1A] text-white'
                  : 'text-[#E3D8CE] hover:bg-white/8 hover:text-[#F8EBAB]'
              }`}
            >
              <span className="flex items-center gap-3 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#F8EBAB]' : 'text-[#F7D87F]/80'}`}
                />
                <span className="truncate">{item.label}</span>
              </span>
              {countHint && (
                <span
                  className={`text-[11px] font-mono tabular-nums ${
                    isActive ? 'text-[#F8EBAB]' : 'text-[#F7D87F]'
                  }`}
                >
                  {countHint}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Account, Multi-User Role Switcher (Local) & Cloud Sync Footer */}
      <div className="p-4 border-t border-white/10 space-y-3">
        {!user && staff.length > 0 && (
          <div className="space-y-1">
            <label htmlFor="local-operator-select" className="block text-[11px] text-[#F7D87F]">
              Active Staff User (Shared DB)
            </label>
            <select
              id="local-operator-select"
              value={activeLocalStaffId}
              onChange={(e) => switchLocalStaff(e.target.value)}
              className="w-full px-2.5 py-2 text-sm sm:text-xs bg-[#33231C] border border-white/15 rounded-lg text-[#FAF8F5] focus:outline-none focus:border-[#F7D87F]"
            >
              {staff.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.role})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="text-xs">
          <p className="text-[#F7D87F] font-medium">
            {syncMode === 'cloud'
              ? `Cloud Shared DB · ${currentUserRole}`
              : `Local Demo · ${currentUserRole}`}
          </p>
          <p className="text-[#C8B9AE] truncate mt-0.5">
            {user ? user.email : 'Sign in to sync multiple staff'}
          </p>
        </div>

        {user ? (
          <button
            type="button"
            onClick={signOutUser}
            className="w-full flex items-center justify-center gap-2 px-3 min-h-[44px] lg:min-h-0 lg:py-2 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium text-[#F8EBAB] transition-colors cursor-pointer whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Sign Out Terminal</span>
          </button>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={signInWithGoogle}
              className="w-full flex items-center justify-center gap-2 px-3 min-h-[44px] lg:min-h-0 lg:py-2 rounded-lg bg-[#F7D87F] hover:bg-[#F8EBAB] text-[#231712] text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <Cloud className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Enable Cloud Sync</span>
            </button>
            <button
              type="button"
              onClick={signOutUser}
              className="w-full flex items-center justify-center gap-2 px-3 min-h-[44px] lg:min-h-0 lg:py-2 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium text-[#E3D8CE] transition-colors cursor-pointer whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Lock / Switch Login</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop fixed sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 h-screen sticky top-0 no-print">
        {content}
      </aside>

      {/* Mobile slide-over drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-[1px]"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative w-72 max-w-[85vw] h-full z-10 shadow-2xl">{content}</aside>
        </div>
      )}
    </>
  );
};

interface MobileBottomNavProps {
  activeView: ActiveView;
  onSelectView: (view: ActiveView) => void;
  onOpenMore: () => void;
}

const PRIMARY_MOBILE_TABS: Array<{
  id: ActiveView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'pos', label: 'POS', icon: ShoppingBag },
  { id: 'sales', label: 'Sales', icon: Receipt },
  { id: 'inventory', label: 'Stock', icon: Package },
  { id: 'debts', label: 'Tabs', icon: BookOpen },
];

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeView,
  onSelectView,
  onOpenMore,
}) => {
  const { debts, inventory } = usePos();
  const openTabsCount = debts.filter((d) => d.status === 'open').length;
  const lowStockCount = inventory.filter((i) => i.quantity <= i.reorderLevel).length;
  const isMoreActive = !PRIMARY_MOBILE_TABS.some((t) => t.id === activeView);

  return (
    <nav
      aria-label="Quick Mobile Navigation"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E8DFD3] pb-safe no-print"
    >
      <div className="grid grid-cols-5 h-[52px] items-stretch">
        {PRIMARY_MOBILE_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeView === tab.id;
          const badgeCount =
            tab.id === 'debts' ? openTabsCount : tab.id === 'inventory' ? lowStockCount : 0;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectView(tab.id)}
              aria-current={active ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold tracking-tight transition-colors cursor-pointer ${
                active ? 'text-[#BE1A1A]' : 'text-[#5C493F] hover:text-[#231712]'
              }`}
            >
              <span className="relative">
                <Icon className="w-[19px] h-[19px]" aria-hidden="true" />
                {badgeCount > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[15px] h-[15px] px-1 rounded-full bg-[#BE1A1A] text-white font-mono text-[9px] leading-[15px] text-center tabular-nums">
                    {badgeCount > 9 ? '9+' : badgeCount}
                  </span>
                )}
              </span>
              <span className="whitespace-nowrap leading-none">{tab.label}</span>
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-7 h-0.5 bg-[#BE1A1A] rounded-b-full"
                />
              )}
            </button>
          );
        })}

        <button
          type="button"
          onClick={onOpenMore}
          aria-label="More boutique tools and menu"
          className={`relative flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold tracking-tight transition-colors cursor-pointer ${
            isMoreActive ? 'text-[#BE1A1A]' : 'text-[#5C493F] hover:text-[#231712]'
          }`}
        >
          <Menu className="w-[19px] h-[19px]" aria-hidden="true" />
          <span className="whitespace-nowrap leading-none">More</span>
          {isMoreActive && (
            <span
              aria-hidden="true"
              className="absolute top-0 left-1/2 -translate-x-1/2 w-7 h-0.5 bg-[#BE1A1A] rounded-b-full"
            />
          )}
        </button>
      </div>
    </nav>
  );
};
