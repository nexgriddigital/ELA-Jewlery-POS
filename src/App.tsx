import React, { useEffect, useRef, useState } from 'react';
import { Menu, Cloud, HardDrive, X } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PosProvider, usePos } from './context/PosContext';
import { WelcomeGate } from './components/WelcomeGate';
import { WelcomeLoadingScreen } from './components/WelcomeLoadingScreen';
import { AccessPendingGate } from './components/AccessPendingGate';
import { Sidebar, MobileBottomNav } from './components/Sidebar';
import { PosRegisterView } from './components/PosRegisterView';
import { SalesLedgerView } from './components/SalesLedgerView';
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
  sales: 'Sales Ledger',
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
    loadingData,
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
  const [welcomeTransitionActive, setWelcomeTransitionActive] = useState<boolean>(enteredApp);
  const prevEnteredRef = useRef<boolean>(enteredApp);

  // Trigger brief personalized Welcome loading animation when entering the terminal
  useEffect(() => {
    if (enteredApp && !prevEnteredRef.current) {
      setWelcomeTransitionActive(true);
    } else if (!enteredApp && prevEnteredRef.current) {
      setWelcomeTransitionActive(false);
    }
    prevEnteredRef.current = enteredApp;
  }, [enteredApp]);

  useEffect(() => {
    if (!welcomeTransitionActive) return;
    const timer = window.setTimeout(() => {
      setWelcomeTransitionActive(false);
    }, 1350);
    return () => window.clearTimeout(timer);
  }, [welcomeTransitionActive]);

  // Redirect to POS if current role loses permission for the active tab
  useEffect(() => {
    if (activeView === 'purchases' && !can('purchases')) setActiveView('pos');
    if (activeView === 'staff' && !can('staff_admin')) setActiveView('pos');
    if (activeView === 'reset' && !can('system_reset')) setActiveView('pos');
  }, [activeView, can]);

  if (!authReady || (user && accessStatus === 'checking')) {
    return (
      <WelcomeLoadingScreen
        userName={user ? activeCashierName : undefined}
        subtitle="Connecting to shared ELA Jewelry database..."
      />
    );
  }

  if (user && accessStatus === 'unauthorized') {
    return <AccessPendingGate />;
  }

  if (!enteredApp) {
    return <WelcomeGate />;
  }

  const showWorkspaceLoader = loadingData || welcomeTransitionActive;

  return (
    <div className="min-h-dvh flex bg-[#FAF8F5] text-[#231712]">
      <AnimatePresence>
        {showWorkspaceLoader && (
          <WelcomeLoadingScreen
            key="welcome-loader"
            userName={activeCashierName}
            userRole={currentUserRole}
            subtitle={
              loadingData
                ? 'Syncing shared inventory & sales ledger...'
                : 'Preparing your boutique register...'
            }
          />
        )}
      </AnimatePresence>
      <Sidebar
        activeView={activeView}
        onSelectView={setActiveView}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb Left — Shared Store & Operator Context Right */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-[#E8DFD3] px-3.5 sm:px-6 lg:px-8 h-11 sm:h-14 flex items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden min-w-[40px] min-h-[40px] -ml-2 flex items-center justify-center rounded-lg text-[#231712] hover:bg-[#FAF8F5] cursor-pointer shrink-0"
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
        <main className="flex-1 p-3.5 sm:p-6 lg:p-8 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] lg:pb-8 max-w-[1440px] w-full mx-auto">
          {activeView === 'pos' && <PosRegisterView />}
          {activeView === 'sales' && <SalesLedgerView />}
          {activeView === 'inventory' && <InventoryView />}
          {activeView === 'purchases' && can('purchases') && <PurchasesView />}
          {activeView === 'labels' && <LabelStudioView />}
          {activeView === 'reports' && <ReportsView />}
          {activeView === 'debts' && <DebtCreditView />}
          {activeView === 'staff' && can('staff_admin') && <StaffView />}
          {activeView === 'reset' && can('system_reset') && <ResetCenterView />}
        </main>
      </div>

      {/* Thumb-Zone Mobile Bottom Tab Navigation */}
      <MobileBottomNav
        activeView={activeView}
        onSelectView={setActiveView}
        onOpenMore={() => setMobileMenuOpen(true)}
      />

      {/* Live Toast Feedback */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))] lg:bottom-5 left-3.5 right-3.5 sm:left-auto sm:right-5 z-50 sm:max-w-md px-4 py-3 rounded-xl border shadow-lg flex items-center justify-between gap-3 text-sm no-print ${
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
            className="min-w-[36px] min-h-[36px] flex items-center justify-center -mr-1.5 opacity-75 hover:opacity-100 cursor-pointer shrink-0"
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
