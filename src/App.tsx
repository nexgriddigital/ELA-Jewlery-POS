import React, { useEffect, useState } from 'react';
import { Menu, Cloud, HardDrive, X } from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PosProvider, usePos } from './context/PosContext';
import { WelcomeGate } from './components/WelcomeGate';
import { AccessPendingGate } from './components/AccessPendingGate';
import { Sidebar } from './components/Sidebar';
import { PosRegisterView } from './components/PosRegisterView';
import { InventoryView } from './components/InventoryView';
import { PurchasesView } from './components/PurchasesView';
import { LabelStudioView } from './components/LabelStudioView';
import { ReportsView } from './components/ReportsView';
import { DebtCreditView } from './components/DebtCreditView';
import { StaffView } from './components/StaffView';
import { ResetCenterView } from './components/ResetCenterView';
import { ActiveView } from './types/pos';

const VIEW_LABELS: Record<ActiveView, string> = {
  pos: 'POS Register',
  inventory: 'Inventory',
  purchases: 'Purchases',
  labels: 'Label Studio',
  reports: 'Reports & Valuation',
  debts: 'Debt & Credit',
  staff: 'Users & Staff',
  reset: 'System Reset',
};

const PosShell: React.FC = () => {
  const {
    user,
    enteredApp,
    authReady,
    accessStatus,
    currentUserRole,
    can,
    authorizedMemberCount,
    syncMode,
    lastSyncedAt,
    activeCashierName,
    toast,
    dismissToast,
  } = usePos();

  const [activeView, setActiveView] = useState<ActiveView>('pos');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Redirect to POS if current role loses permission for the active tab
  useEffect(() => {
    if (activeView === 'purchases' && !can('purchases')) setActiveView('pos');
    if (activeView === 'staff' && !can('staff_admin')) setActiveView('pos');
    if (activeView === 'reset' && !can('system_reset')) setActiveView('pos');
  }, [activeView, can]);

  if (!authReady || (user && accessStatus === 'checking')) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center">
        <div className="text-center space-y-3">
          <img
            src="./assets/aistudio/image_89dfb75c.png"
            alt="ELA Jewelry"
            className="h-20 mx-auto object-contain"
            referrerPolicy="no-referrer"
          />
          <p className="text-sm text-[#766257]">
            Connecting to shared ELA Jewelry database...
          </p>
        </div>
      </div>
    );
  }

  if (user && accessStatus === 'unauthorized') {
    return <AccessPendingGate />;
  }

  if (!enteredApp) {
    return <WelcomeGate />;
  }

  return (
    <div className="min-h-screen flex bg-[#FAF8F5] text-[#231712]">
      <Sidebar
        activeView={activeView}
        onSelectView={setActiveView}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb Left — Shared Store & Operator Context Right */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-[#E8DFD3] px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-2 rounded-lg text-[#231712] hover:bg-[#FAF8F5] cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="font-display font-semibold text-[#231712] whitespace-nowrap">
                ELA Jewelry
              </span>
              <span className="text-[#C8B9AE]" aria-hidden="true">
                /
              </span>
              <span className="font-medium text-[#766257] truncate">
                {VIEW_LABELS[activeView]}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs text-[#766257] shrink-0 whitespace-nowrap">
            <span className="hidden sm:inline">
              {activeCashierName}{' '}
              <span className="text-[#BE1A1A] font-semibold">({currentUserRole})</span>
            </span>
            <span className="hidden sm:inline text-[#D8CBBF]" aria-hidden="true">
              ·
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium text-[#231712]">
              {syncMode === 'cloud' ? (
                <Cloud className="w-3.5 h-3.5 text-[#16A34A]" aria-hidden="true" />
              ) : (
                <HardDrive className="w-3.5 h-3.5 text-[#D0311E]" aria-hidden="true" />
              )}
              <span className="sm:hidden">{syncMode === 'cloud' ? 'Shared DB' : 'Local'}</span>
              <span className="hidden sm:inline">
                {syncMode === 'cloud'
                  ? `Shared Store DB · ${authorizedMemberCount} users`
                  : `Shared Local DB · ${authorizedMemberCount} users`}
              </span>
              <span className="hidden md:inline font-mono text-[#766257]">({lastSyncedAt})</span>
            </span>
          </div>
        </header>

        {/* Main Workspace Canvas */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {activeView === 'pos' && <PosRegisterView />}
          {activeView === 'inventory' && <InventoryView />}
          {activeView === 'purchases' && can('purchases') && <PurchasesView />}
          {activeView === 'labels' && <LabelStudioView />}
          {activeView === 'reports' && <ReportsView />}
          {activeView === 'debts' && <DebtCreditView />}
          {activeView === 'staff' && can('staff_admin') && <StaffView />}
          {activeView === 'reset' && can('system_reset') && <ResetCenterView />}
        </main>
      </div>

      {/* Live Toast Feedback */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-5 left-4 right-4 sm:left-auto sm:right-5 z-50 sm:max-w-md px-4 py-3 rounded-xl border shadow-lg flex items-center justify-between gap-3 text-sm no-print ${
            toast.kind === 'error'
              ? 'bg-[#BE1A1A] border-[#D0311E] text-white'
              : toast.kind === 'success'
              ? 'bg-[#231712] border-[#F7D87F]/50 text-[#F8EBAB]'
              : 'bg-white border-[#E8DFD3] text-[#231712]'
          }`}
        >
          <span>{toast.text}</span>
          <button
            type="button"
            onClick={dismissToast}
            aria-label="Dismiss notification"
            className="p-1 opacity-75 hover:opacity-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <PosProvider>
        <PosShell />
      </PosProvider>
    </ErrorBoundary>
  );
}
