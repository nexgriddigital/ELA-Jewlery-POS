import React, { useState } from 'react';
import { CalendarCheck, AlertTriangle, Check, Trash2 } from 'lucide-react';
import { usePos } from '../context/PosContext';
import { formatCurrency } from '../utils/posLogic';

export const ResetCenterView: React.FC = () => {
  const { inventory, sales, purchases, debts, performYearlyReset, performFullReset, notify } =
    usePos();

  const [yearlyInput, setYearlyInput] = useState('');
  const [yearlyBusy, setYearlyBusy] = useState(false);

  const [fullInput, setFullInput] = useState('');
  const [includeStaff, setIncludeStaff] = useState(false);
  const [fullBusy, setFullBusy] = useState(false);

  const openDebts = debts.filter((d) => d.status === 'open' && d.balance > 0);
  const settledDebts = debts.filter((d) => d.status === 'settled' || d.balance <= 0);
  const openDebtBalance = openDebts.reduce((sum, d) => sum + d.balance, 0);

  const handleYearlyReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (yearlyInput.trim().toUpperCase() !== 'YEARLY RESET') {
      notify('error', 'Type YEARLY RESET exactly to execute fiscal year close.');
      return;
    }
    setYearlyBusy(true);
    try {
      await performYearlyReset();
      setYearlyInput('');
    } finally {
      setYearlyBusy(false);
    }
  };

  const handleFullReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fullInput.trim().toUpperCase() !== 'RESET ALL') {
      notify('error', 'Type RESET ALL exactly to confirm full factory wipe.');
      return;
    }
    setFullBusy(true);
    try {
      await performFullReset(includeStaff);
      setFullInput('');
    } finally {
      setFullBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[#231712]">
          System Reset &amp; Fiscal Year Close
        </h1>
        <p className="text-sm text-[#766257] mt-0.5">
          Safely close an accounting year while retaining stock &amp; open tabs, or perform a full
          system reset
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* 9.2 Yearly Reset (Preserves Open Tabs & Current Inventory) */}
        <form
          onSubmit={handleYearlyReset}
          className="bg-white border border-[#F7D87F] rounded-2xl p-6 flex flex-col justify-between space-y-5"
        >
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[#BE1A1A]">Recommended Fiscal Close</p>
                <h2 className="font-display text-xl font-semibold text-[#231712] mt-1">
                  Yearly Reset
                </h2>
              </div>
              <CalendarCheck className="w-6 h-6 text-[#BE1A1A] shrink-0" aria-hidden="true" />
            </div>

            <p className="text-sm text-[#5C493F] leading-relaxed">
              Starts a clean accounting period by clearing historical sales, purchase orders, and
              settled customer tabs while strictly carrying forward your live inventory stock and
              all open customer credit tabs.
            </p>

            <div className="grid grid-cols-2 gap-3 text-xs bg-[#FAF8F5] border border-[#E8DFD3] rounded-xl p-4">
              <div className="space-y-1.5">
                <p className="font-semibold text-[#16A34A] flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Preserved Intact</span>
                </p>
                <p className="font-mono tabular-nums text-[#231712]">
                  {inventory.length} Inventory SKUs
                </p>
                <p className="font-mono tabular-nums text-[#231712]">
                  {openDebts.length} Open Credit Tabs ({formatCurrency(openDebtBalance)})
                </p>
                <p className="text-[#5C493F]">All Staff Accounts</p>
              </div>

              <div className="space-y-1.5">
                <p className="font-semibold text-[#D0311E] flex items-center gap-1">
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Cleared for New Year</span>
                </p>
                <p className="font-mono tabular-nums text-[#231712]">{sales.length} Sales Records</p>
                <p className="font-mono tabular-nums text-[#231712]">
                  {purchases.length} Purchase Orders
                </p>
                <p className="font-mono tabular-nums text-[#231712]">
                  {settledDebts.length} Settled Credit Tabs
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-[#E8DFD3]">
            <div>
              <label htmlFor="yearly-reset-confirm" className="block text-xs font-semibold text-[#231712] mb-1">
                Type <span className="font-mono text-[#BE1A1A]">YEARLY RESET</span> to proceed
              </label>
              <input
                id="yearly-reset-confirm"
                type="text"
                value={yearlyInput}
                onChange={(e) => setYearlyInput(e.target.value)}
                placeholder="YEARLY RESET"
                className="w-full px-3 py-2 text-sm font-mono bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg focus:outline-none focus:border-[#BE1A1A]"
              />
            </div>

            <button
              type="submit"
              disabled={yearlyBusy}
              className="w-full py-2.5 px-4 bg-[#231712] hover:bg-[#3A271F] text-[#F7D87F] font-semibold text-sm rounded-xl transition-colors cursor-pointer"
            >
              {yearlyBusy ? 'Closing Fiscal Year...' : 'Execute Yearly Reset'}
            </button>
          </div>
        </form>

        {/* 9.1 Reset Everything */}
        <form
          onSubmit={handleFullReset}
          className="bg-white border border-[#D0311E]/50 rounded-2xl p-6 flex flex-col justify-between space-y-5"
        >
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[#D0311E]">Irreversible Factory Wipe</p>
                <h2 className="font-display text-xl font-semibold text-[#231712] mt-1">
                  Reset Everything
                </h2>
              </div>
              <AlertTriangle className="w-6 h-6 text-[#D0311E] shrink-0" aria-hidden="true" />
            </div>

            <p className="text-sm text-[#5C493F] leading-relaxed">
              Permanently deletes all inventory catalog items, sales history, supplier purchases,
              and every customer credit/debt tab (including open balances) across all synced
              devices.
            </p>

            <div className="bg-[#FCE8E6]/60 border border-[#D0311E]/30 rounded-xl p-4 text-xs space-y-1.5 text-[#231712]">
              <p className="font-semibold text-[#BE1A1A]">Records scheduled for deletion:</p>
              <p className="font-mono tabular-nums">
                {inventory.length} inventory SKUs · {sales.length} sales · {purchases.length}{' '}
                purchases · {debts.length} debt tabs
              </p>
              <label className="flex items-center gap-2 pt-2 cursor-pointer text-[#231712]">
                <input
                  type="checkbox"
                  checked={includeStaff}
                  onChange={(e) => setIncludeStaff(e.target.checked)}
                  className="accent-[#BE1A1A]"
                />
                <span>Also remove all staff user accounts</span>
              </label>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-[#E8DFD3]">
            <div>
              <label htmlFor="full-reset-confirm" className="block text-xs font-semibold text-[#231712] mb-1">
                Type <span className="font-mono text-[#BE1A1A]">RESET ALL</span> to permanently wipe
              </label>
              <input
                id="full-reset-confirm"
                type="text"
                value={fullInput}
                onChange={(e) => setFullInput(e.target.value)}
                placeholder="RESET ALL"
                className="w-full px-3 py-2 text-sm font-mono bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg focus:outline-none focus:border-[#BE1A1A]"
              />
            </div>

            <button
              type="submit"
              disabled={fullBusy}
              className="w-full py-2.5 px-4 bg-[#BE1A1A] hover:bg-[#D0311E] text-white font-semibold text-sm rounded-xl transition-colors cursor-pointer"
            >
              {fullBusy ? 'Wiping System...' : 'Reset Everything'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
