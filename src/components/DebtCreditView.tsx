import React, { useMemo, useState } from 'react';
import { Plus, Wallet, X, ChevronDown, ChevronUp } from 'lucide-react';
import { usePos } from '../context/PosContext';
import { DateRange, DebtRecord, PaymentMethod } from '../types/pos';
import { formatCurrency, generateDebtReport, getTodayDateString } from '../utils/posLogic';

const REPAYMENT_METHODS: Array<Exclude<PaymentMethod, 'Credit / Tab'>> = [
  'Cash',
  'Card',
  'Bank Transfer',
  'Mobile Money',
];

export const DebtCreditView: React.FC = () => {
  const { debts, addDebtRecord, recordDebtPayment, notify } = usePos();

  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'settled'>('all');
  const [range, setRange] = useState<DateRange>({ from: '', to: '' });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Add Debt Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [description, setDescription] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [paidAmount, setPaidAmount] = useState('0');
  const [dueDate, setDueDate] = useState(getTodayDateString());

  // Repayment Modal
  const [payTarget, setPayTarget] = useState<DebtRecord | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<Exclude<PaymentMethod, 'Credit / Tab'>>('Cash');
  const [payNote, setPayNote] = useState('');

  const report = useMemo(() => generateDebtReport(debts, range), [debts, range]);

  const filteredDebts = useMemo(() => {
    return report.debtsInRange.filter((d) => {
      if (statusFilter === 'open') return d.status === 'open';
      if (statusFilter === 'settled') return d.status === 'settled';
      return true;
    });
  }, [report.debtsInRange, statusFilter]);

  const handleCreateDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    const total = Number(totalAmount);
    const paid = Number(paidAmount) || 0;
    if (!customerName.trim()) {
      notify('error', 'Customer name is required.');
      return;
    }
    if (!Number.isFinite(total) || total <= 0) {
      notify('error', 'Total credit amount must be greater than 0.');
      return;
    }
    if (paid < 0 || paid > total) {
      notify('error', 'Initial deposit must be between 0 and total credit amount.');
      return;
    }

    await addDebtRecord({
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      description: description.trim() || 'Boutique Credit Tab',
      totalAmount: total,
      paidAmount: paid,
      dueDate,
    });
    setCreateOpen(false);
    setCustomerName('');
    setCustomerPhone('');
    setDescription('');
    setTotalAmount('');
    setPaidAmount('0');
  };

  const handleRecordRepayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payTarget) return;
    const amount = Number(payAmount);
    try {
      await recordDebtPayment(payTarget.id, amount, payMethod, payNote.trim());
      setPayTarget(null);
      setPayAmount('');
      setPayNote('');
    } catch {
      // handled by context toast
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-semibold text-[#231712]">
            Debt / Credit Ledger &amp; Report
          </h1>
          <p className="text-xs sm:text-sm text-[#766257] mt-0.5">
            Track customer credit tabs, record installment repayments &amp; monitor balances · Open
            tabs survive Yearly Reset
          </p>
        </div>

        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#BE1A1A] hover:bg-[#D0311E] text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>Record Credit Tab</span>
        </button>
      </div>

      {/* Debt Report KPI Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="bg-[#231712] text-white rounded-xl p-3.5 sm:p-4">
          <p className="text-xs text-[#F7D87F]">Outstanding Balance</p>
          <p className="font-mono tabular-nums text-lg sm:text-2xl font-bold mt-1">
            {formatCurrency(report.totalOutstandingBalance)}
          </p>
          <p className="text-xs text-[#C8B9AE] mt-1">{report.openTabsCount} open tab(s)</p>
        </div>
        <div className="bg-white border border-[#E8DFD3] rounded-xl p-3.5 sm:p-4">
          <p className="text-xs text-[#766257]">Credit Issued (Range)</p>
          <p className="font-mono tabular-nums text-lg sm:text-2xl font-semibold text-[#231712] mt-1">
            {formatCurrency(report.totalIssuedInRange)}
          </p>
        </div>
        <div className="bg-white border border-[#E8DFD3] rounded-xl p-3.5 sm:p-4">
          <p className="text-xs text-[#766257]">Repayments Collected</p>
          <p className="font-mono tabular-nums text-lg sm:text-2xl font-semibold text-[#16A34A] mt-1">
            {formatCurrency(report.totalCollectedInRange)}
          </p>
        </div>
        <div className="bg-white border border-[#E8DFD3] rounded-xl p-3.5 sm:p-4">
          <p className="text-xs text-[#766257]">Settled Tabs</p>
          <p className="font-mono tabular-nums text-lg sm:text-2xl font-semibold text-[#231712] mt-1">
            {report.settledTabsCount}
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-[#E8DFD3] rounded-xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3">
        <div className="grid grid-cols-3 sm:flex items-center gap-1 bg-[#FAF8F5] p-1 rounded-lg border border-[#E8DFD3] w-full sm:w-auto">
          {(
            [
              { id: 'all', label: 'All Tabs' },
              { id: 'open', label: 'Open Tabs' },
              { id: 'settled', label: 'Settled' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setStatusFilter(t.id)}
              className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
                statusFilter === t.id
                  ? 'bg-[#231712] text-[#F7D87F]'
                  : 'text-[#5C493F] hover:text-[#231712]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 text-xs w-full sm:w-auto">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-1.5">
            <label htmlFor="debt-from" className="text-[#766257]">
              Issued From
            </label>
            <input
              id="debt-from"
              type="date"
              value={range.from}
              onChange={(e) => setRange({ ...range, from: e.target.value })}
              className="w-full sm:w-auto px-2.5 py-1.5 font-mono bg-[#FAF8F5] border border-[#E8DFD3] rounded-md"
            />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-1.5">
            <label htmlFor="debt-to" className="text-[#766257]">
              To
            </label>
            <input
              id="debt-to"
              type="date"
              value={range.to}
              onChange={(e) => setRange({ ...range, to: e.target.value })}
              className="w-full sm:w-auto px-2.5 py-1.5 font-mono bg-[#FAF8F5] border border-[#E8DFD3] rounded-md"
            />
          </div>
          {(range.from || range.to) && (
            <button
              type="button"
              onClick={() => setRange({ from: '', to: '' })}
              className="col-span-2 sm:col-span-1 text-left sm:text-center text-xs font-medium text-[#BE1A1A] hover:underline cursor-pointer py-1"
            >
              Clear Dates
            </button>
          )}
        </div>
      </div>

      {/* Debt Ledger Rows */}
      <div className="bg-white border border-[#E8DFD3] rounded-xl overflow-hidden">
        {filteredDebts.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#766257]">
            No customer credit tabs match this filter.
          </div>
        ) : (
          <div className="divide-y divide-[#E8DFD3]">
            {filteredDebts.map((debt) => {
              const isOpen = debt.status === 'open';
              const isExpanded = expandedId === debt.id;

              return (
                <div key={debt.id} className="p-4 hover:bg-[#FAF8F5]/50 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-[#231712]">
                          {debt.customerName}
                        </h3>
                        <span className="text-xs font-mono text-[#766257]">
                          {debt.customerPhone || 'No phone'}
                        </span>
                        <span className="text-xs text-[#766257]" aria-hidden="true">
                          ·
                        </span>
                        <span
                          className={`text-xs font-semibold ${
                            isOpen ? 'text-[#D0311E]' : 'text-[#16A34A]'
                          }`}
                        >
                          {isOpen ? 'Open Tab' : 'Settled'}
                        </span>
                      </div>
                      <p className="text-xs text-[#5C493F] mt-1">{debt.description}</p>
                      <p className="text-[11px] font-mono text-[#766257] mt-0.5">
                        Issued {debt.issuedDate}
                        {debt.dueDate ? ` · Due ${debt.dueDate}` : ''}
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#F0E9DF]">
                      <div className="flex sm:block items-baseline justify-between sm:text-right font-mono tabular-nums">
                        <p className="text-xs text-[#766257]">
                          Paid {formatCurrency(debt.paidAmount)} / {formatCurrency(debt.totalAmount)}
                        </p>
                        <p
                          className={`text-base font-bold ${
                            isOpen ? 'text-[#BE1A1A]' : 'text-[#16A34A]'
                          }`}
                        >
                          Balance {formatCurrency(debt.balance)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {isOpen && (
                          <button
                            type="button"
                            onClick={() => {
                              setPayTarget(debt);
                              setPayAmount(String(debt.balance));
                              setPayMethod('Cash');
                              setPayNote('');
                            }}
                            aria-label={`Record repayment for ${debt.customerName}`}
                            className="flex-1 sm:flex-initial min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#BE1A1A] hover:bg-[#D0311E] text-white rounded-lg cursor-pointer whitespace-nowrap"
                          >
                            <Wallet className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Record Payment</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : debt.id)}
                          aria-expanded={isExpanded}
                          aria-label={`Toggle payment history for ${debt.customerName}`}
                          className="min-w-[40px] min-h-[40px] flex items-center justify-center p-2 rounded-lg border border-[#E8DFD3] hover:bg-[#FAF8F5] text-[#5C493F] cursor-pointer"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-[#E8DFD3] text-xs">
                      <p className="font-semibold text-[#231712] mb-2">
                        Repayment History ({debt.payments.length})
                      </p>
                      {debt.payments.length === 0 ? (
                        <p className="text-[#766257]">No repayments recorded yet.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {debt.payments.map((p) => (
                            <li
                              key={p.id}
                              className="flex flex-wrap items-center justify-between gap-2 bg-[#FAF8F5] px-3 py-2 rounded-lg"
                            >
                              <span className="text-[#231712]">
                                <span className="font-mono text-[#766257] mr-2">{p.paidAt}</span>
                                {p.method}
                                {p.note ? ` · ${p.note}` : ''} · by {p.recordedBy}
                              </span>
                              <span className="font-mono tabular-nums font-semibold text-[#16A34A]">
                                +{formatCurrency(p.amount)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Record New Debt Modal */}
      {createOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="debt-create-title"
          className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <form
            onSubmit={handleCreateDebt}
            className="bg-white border border-[#E8DFD3] rounded-t-2xl sm:rounded-2xl max-w-md w-full p-5 sm:p-6 space-y-4 max-h-[92dvh] overflow-y-auto pb-safe"
          >
            <div className="flex items-center justify-between border-b border-[#E8DFD3] pb-3">
              <h2 id="debt-create-title" className="font-display text-xl font-semibold text-[#231712]">
                Record Customer Credit Tab
              </h2>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                aria-label="Close credit modal"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-[#766257] hover:bg-[#FAF8F5] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label htmlFor="debt-name" className="block text-xs font-semibold text-[#231712] mb-1">
                  Customer Full Name *
                </label>
                <input
                  id="debt-name"
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3 py-2 text-base sm:text-sm bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg"
                />
              </div>

              <div>
                <label htmlFor="debt-phone" className="block text-xs font-semibold text-[#231712] mb-1">
                  Phone Number
                </label>
                <input
                  id="debt-phone"
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="+251-9..."
                  className="w-full px-3 py-2 text-base sm:text-sm bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg"
                />
              </div>

              <div>
                <label htmlFor="debt-desc" className="block text-xs font-semibold text-[#231712] mb-1">
                  Items / Description
                </label>
                <input
                  id="debt-desc"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g., 18K Gold Bracelet Reserve"
                  className="w-full px-3 py-2 text-base sm:text-sm bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="debt-total" className="block text-xs font-semibold text-[#231712] mb-1">
                    Total Credit ($) *
                  </label>
                  <input
                    id="debt-total"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={totalAmount}
                    onChange={(e) => setTotalAmount(e.target.value)}
                    className="w-full px-3 py-2 text-base sm:text-sm font-mono tabular-nums bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="debt-paid" className="block text-xs font-semibold text-[#231712] mb-1">
                    Initial Deposit ($)
                  </label>
                  <input
                    id="debt-paid"
                    type="number"
                    min="0"
                    step="0.01"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                    className="w-full px-3 py-2 text-base sm:text-sm font-mono tabular-nums bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="debt-due" className="block text-xs font-semibold text-[#231712] mb-1">
                  Due Date
                </label>
                <input
                  id="debt-due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 text-base sm:text-sm font-mono bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-[#E8DFD3] grid grid-cols-2 sm:flex sm:justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="min-h-[44px] px-4 py-2 text-sm font-medium text-[#5C493F] border border-[#E8DFD3] sm:border-transparent hover:bg-[#FAF8F5] rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="min-h-[44px] px-5 py-2 text-sm font-semibold bg-[#BE1A1A] hover:bg-[#D0311E] text-white rounded-lg cursor-pointer"
              >
                Save Credit Tab
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Repayment Modal */}
      {payTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="repay-modal-title"
          className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <form
            onSubmit={handleRecordRepayment}
            className="bg-white border border-[#E8DFD3] rounded-t-2xl sm:rounded-2xl max-w-md w-full p-5 sm:p-6 space-y-4 max-h-[92dvh] overflow-y-auto pb-safe"
          >
            <div className="flex items-center justify-between border-b border-[#E8DFD3] pb-3">
              <h2 id="repay-modal-title" className="font-display text-lg font-semibold text-[#231712]">
                Record Repayment — {payTarget.customerName}
              </h2>
              <button
                type="button"
                onClick={() => setPayTarget(null)}
                aria-label="Close repayment modal"
                className="p-1.5 rounded-lg text-[#766257] hover:bg-[#FAF8F5] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#766257]">
              Remaining balance:{' '}
              <span className="font-mono font-bold text-[#BE1A1A]">
                {formatCurrency(payTarget.balance)}
              </span>
            </p>

            <div className="space-y-3">
              <div>
                <label htmlFor="repay-amount" className="block text-xs font-semibold text-[#231712] mb-1">
                  Repayment Amount ($) *
                </label>
                <input
                  id="repay-amount"
                  type="number"
                  min="0.01"
                  max={payTarget.balance}
                  step="0.01"
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg"
                />
              </div>

              <div>
                <label htmlFor="repay-method" className="block text-xs font-semibold text-[#231712] mb-1">
                  Payment Method
                </label>
                <select
                  id="repay-method"
                  value={payMethod}
                  onChange={(e) =>
                    setPayMethod(e.target.value as Exclude<PaymentMethod, 'Credit / Tab'>)
                  }
                  className="w-full px-3 py-2 text-sm bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg"
                >
                  {REPAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="repay-note" className="block text-xs font-semibold text-[#231712] mb-1">
                  Receipt Note
                </label>
                <input
                  id="repay-note"
                  type="text"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  placeholder="Optional payment reference"
                  className="w-full px-3 py-2 text-sm bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-[#E8DFD3] grid grid-cols-2 sm:flex sm:justify-end gap-2">
              <button
                type="button"
                onClick={() => setPayTarget(null)}
                className="min-h-[44px] px-4 py-2 text-sm font-medium text-[#5C493F] border border-[#E8DFD3] sm:border-transparent hover:bg-[#FAF8F5] rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="min-h-[44px] px-5 py-2 text-sm font-semibold bg-[#BE1A1A] hover:bg-[#D0311E] text-white rounded-lg cursor-pointer"
              >
                Confirm Payment
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
