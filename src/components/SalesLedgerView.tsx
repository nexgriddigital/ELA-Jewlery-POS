import React, { useMemo, useState } from 'react';
import { Download, Printer, Receipt, RotateCcw, Search, X } from 'lucide-react';
import { usePos } from '../context/PosContext';
import { DateRange, PAYMENT_METHODS, PaymentMethod, SaleRecord } from '../types/pos';
import {
  formatCurrency,
  getTodayDateString,
  isDateInRange,
  roundMoney,
  toCsv,
} from '../utils/posLogic';

function offsetDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return getTodayDateString(d);
}

export const SalesLedgerView: React.FC = () => {
  const { sales, can, voidSale } = usePos();

  const today = getTodayDateString();
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'All' | PaymentMethod>('All');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'voided'>('all');
  const [range, setRange] = useState<DateRange>({ from: '', to: '' });

  const [selectedReceipt, setSelectedReceipt] = useState<SaleRecord | null>(null);
  const [confirmVoidSale, setConfirmVoidSale] = useState<SaleRecord | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);

  const canVoid = can('void_sale');

  const filteredSales = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sales
      .filter((s) => {
        if (paymentFilter !== 'All' && s.paymentMethod !== paymentFilter) return false;
        if (statusFilter !== 'all' && s.status !== statusFilter) return false;
        if ((range.from || range.to) && !isDateInRange(s.saleDate, range)) return false;
        if (!q) return true;
        const inHeader =
          s.receiptNumber.toLowerCase().includes(q) ||
          s.customerName.toLowerCase().includes(q) ||
          s.customerPhone.toLowerCase().includes(q) ||
          s.cashierName.toLowerCase().includes(q);
        if (inHeader) return true;
        return s.items.some(
          (li) => li.name.toLowerCase().includes(q) || li.sku.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (b.saleDate > a.saleDate ? 1 : b.saleDate < a.saleDate ? -1 : 0));
  }, [paymentFilter, range, sales, search, statusFilter]);

  const metrics = useMemo(() => {
    const completed = filteredSales.filter((s) => s.status === 'completed');
    const voided = filteredSales.filter((s) => s.status === 'voided');
    const grossRevenue = roundMoney(completed.reduce((sum, s) => sum + s.total, 0));
    const totalCost = roundMoney(completed.reduce((sum, s) => sum + s.totalCost, 0));
    const netProfit = roundMoney(grossRevenue - totalCost);
    const totalDiscounts = roundMoney(completed.reduce((sum, s) => sum + s.discount, 0));
    const unitsSold = completed.reduce(
      (sum, s) => sum + s.items.reduce((acc, li) => acc + li.quantity, 0),
      0
    );
    const marginPercent =
      grossRevenue > 0 ? roundMoney((netProfit / grossRevenue) * 100) : 0;

    return {
      completedCount: completed.length,
      voidedCount: voided.length,
      unitsSold,
      grossRevenue,
      netProfit,
      marginPercent,
      totalDiscounts,
    };
  }, [filteredSales]);

  const applyPreset = (preset: 'today' | '7d' | '30d' | 'all') => {
    const to = getTodayDateString();
    if (preset === 'today') setRange({ from: to, to });
    else if (preset === '7d') setRange({ from: offsetDays(7), to });
    else if (preset === '30d') setRange({ from: offsetDays(30), to });
    else setRange({ from: '', to: '' });
  };

  const handleExportCsv = () => {
    const csv = toCsv(
      [
        'Receipt #',
        'Date',
        'Status',
        'Customer',
        'Phone',
        'Cashier',
        'Payment Method',
        'Items',
        'Subtotal',
        'Discount',
        'Total',
        'COGS',
        'Profit',
      ],
      filteredSales.map((s) => [
        s.receiptNumber,
        s.saleDate,
        s.status,
        s.customerName || 'Walk-in Client',
        s.customerPhone || '',
        s.cashierName,
        s.paymentMethod,
        s.items.map((li) => `${li.name} x${li.quantity}`).join('; '),
        s.subtotal,
        s.discount,
        s.total,
        s.totalCost,
        roundMoney(s.total - s.totalCost),
      ])
    );

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ela-sales-ledger-${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleConfirmVoid = async () => {
    if (!confirmVoidSale) return;
    setVoidingId(confirmVoidSale.id);
    try {
      await voidSale(confirmVoidSale.id);
      setConfirmVoidSale(null);
    } finally {
      setVoidingId(null);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-semibold text-[#231712]">
            Sales Ledger
          </h1>
          <p className="text-xs sm:text-sm text-[#766257] mt-0.5">
            Complete boutique transaction log · Inspect receipts, export CSV, or void completed sales
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={filteredSales.length === 0}
          className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-[#E8DFD3] hover:bg-[#F8EBAB]/40 disabled:opacity-50 text-[#231712] text-sm font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
        >
          <Download className="w-4 h-4 text-[#BE1A1A]" aria-hidden="true" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="bg-white border border-[#E8DFD3] rounded-xl p-3.5 sm:p-4">
          <p className="text-xs text-[#766257]">Completed Receipts</p>
          <p className="font-mono tabular-nums text-lg sm:text-xl font-semibold text-[#231712] mt-1">
            {metrics.completedCount}
          </p>
          <p className="text-xs text-[#766257] mt-1">{metrics.unitsSold} units sold</p>
        </div>
        <div className="bg-white border border-[#E8DFD3] rounded-xl p-3.5 sm:p-4">
          <p className="text-xs text-[#766257]">Gross Revenue</p>
          <p className="font-mono tabular-nums text-lg sm:text-xl font-semibold text-[#BE1A1A] mt-1">
            {formatCurrency(metrics.grossRevenue)}
          </p>
          <p className="text-xs text-[#766257] mt-1">
            Discounts: {formatCurrency(metrics.totalDiscounts)}
          </p>
        </div>
        <div className="bg-white border border-[#E8DFD3] rounded-xl p-3.5 sm:p-4">
          <p className="text-xs text-[#766257]">Net Profit</p>
          <p className="font-mono tabular-nums text-lg sm:text-xl font-semibold text-[#16A34A] mt-1">
            {formatCurrency(metrics.netProfit)}
          </p>
          <p className="text-xs font-mono text-[#766257] mt-1">{metrics.marginPercent}% margin</p>
        </div>
        <div className="bg-white border border-[#E8DFD3] rounded-xl p-3.5 sm:p-4">
          <p className="text-xs text-[#766257]">Voided Sales</p>
          <p className="font-mono tabular-nums text-lg sm:text-xl font-semibold text-[#D0311E] mt-1">
            {metrics.voidedCount}
          </p>
          <p className="text-xs text-[#766257] mt-1">Stock restored on void</p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white border border-[#E8DFD3] rounded-xl p-3.5 sm:p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 sm:gap-3">
          <div className="md:col-span-5 relative">
            <Search
              className="w-4 h-4 text-[#766257] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search receipt #, customer, cashier, SKU..."
              aria-label="Search sales ledger"
              className="w-full pl-9 pr-3 py-2 text-base sm:text-sm bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg focus:outline-none focus:border-[#BE1A1A]"
            />
          </div>

          <div className="grid grid-cols-2 md:contents gap-2.5">
            <div className="md:col-span-3">
              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value as 'All' | PaymentMethod)}
                aria-label="Filter by payment method"
                className="w-full px-3 py-2 text-sm bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg focus:outline-none focus:border-[#BE1A1A]"
              >
                <option value="All">All Methods</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as 'all' | 'completed' | 'voided')
                }
                aria-label="Filter by sale status"
                className="w-full px-3 py-2 text-sm bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg focus:outline-none focus:border-[#BE1A1A]"
              >
                <option value="all">All Statuses</option>
                <option value="completed">Completed</option>
                <option value="voided">Voided</option>
              </select>
            </div>
          </div>

          <div className="md:col-span-2 grid grid-cols-4 md:flex items-center gap-1 md:justify-end">
            {(
              [
                { id: 'today', label: 'Today' },
                { id: '7d', label: '7D' },
                { id: '30d', label: '30D' },
                { id: 'all', label: 'All' },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className="min-h-[38px] px-2.5 py-1.5 text-xs rounded-lg bg-[#FAF8F5] hover:bg-[#F8EBAB]/60 border border-[#E8DFD3] text-[#231712] font-medium cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2.5 sm:gap-3 text-xs pt-1">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-1.5">
            <label htmlFor="sales-ledger-from" className="text-[#766257]">
              From
            </label>
            <input
              id="sales-ledger-from"
              type="date"
              value={range.from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
              className="w-full sm:w-auto px-2.5 py-1.5 font-mono bg-[#FAF8F5] border border-[#E8DFD3] rounded-md"
            />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-1.5">
            <label htmlFor="sales-ledger-to" className="text-[#766257]">
              To
            </label>
            <input
              id="sales-ledger-to"
              type="date"
              value={range.to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              className="w-full sm:w-auto px-2.5 py-1.5 font-mono bg-[#FAF8F5] border border-[#E8DFD3] rounded-md"
            />
          </div>
        </div>
      </div>

      {/* Sales Ledger Cards (Mobile) & Table (Desktop) */}
      <div className="bg-white border border-[#E8DFD3] rounded-xl overflow-hidden">
        {filteredSales.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#766257]">
            No sales match your current filters. Complete a checkout in the POS Register to populate
            the ledger.
          </div>
        ) : (
          <>
            {/* Mobile Card List */}
            <ul className="md:hidden divide-y divide-[#E8DFD3]">
              {filteredSales.map((sale) => {
                const isVoided = sale.status === 'voided';
                return (
                  <li
                    key={sale.id}
                    className={`p-4 space-y-2.5 ${isVoided ? 'bg-[#FAF8F5]/60 opacity-80' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-mono font-semibold text-[#231712]">
                            {sale.receiptNumber}
                          </span>
                          <span className="text-[#C8B9AE]" aria-hidden="true">
                            ·
                          </span>
                          <span
                            className={
                              isVoided
                                ? 'text-[#D0311E] font-semibold'
                                : 'text-[#16A34A] font-semibold'
                            }
                          >
                            {isVoided ? 'Voided' : 'Completed'}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-[#231712] truncate mt-0.5">
                          {sale.customerName || 'Walk-in Client'}
                        </p>
                      </div>
                      <div className="text-right shrink-0 font-mono tabular-nums">
                        <p
                          className={`text-base font-semibold ${
                            isVoided ? 'line-through text-[#766257]' : 'text-[#231712]'
                          }`}
                        >
                          {formatCurrency(sale.total)}
                        </p>
                        {sale.discount > 0 && (
                          <p className="text-[11px] text-[#D0311E]">
                            -{formatCurrency(sale.discount)} disc.
                          </p>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-[#5C493F] leading-relaxed">
                      {sale.items.map((li) => `${li.name} ×${li.quantity}`).join(' · ')}
                    </p>

                    <div className="flex items-center justify-between gap-2 text-xs text-[#766257]">
                      <span>
                        {sale.saleDate} · {sale.paymentMethod} · {sale.cashierName}
                      </span>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setSelectedReceipt(sale)}
                        aria-label={`View receipt ${sale.receiptNumber}`}
                        className="min-h-[40px] flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#231712] bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg cursor-pointer"
                      >
                        <Receipt className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>View Receipt</span>
                      </button>
                      {canVoid && !isVoided && (
                        <button
                          type="button"
                          onClick={() => setConfirmVoidSale(sale)}
                          aria-label={`Void sale ${sale.receiptNumber}`}
                          className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#D0311E] border border-[#D0311E]/40 rounded-lg cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Void</span>
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-[#FAF8F5] text-xs text-[#766257] border-b border-[#E8DFD3]">
                  <tr>
                    <th className="px-4 py-3 font-medium">Receipt #</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Customer</th>
                    <th className="px-4 py-3 font-medium">Items Sold</th>
                    <th className="px-4 py-3 font-medium">Cashier</th>
                    <th className="px-4 py-3 font-medium">Payment</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Total</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8DFD3]">
                  {filteredSales.map((sale) => {
                    const isVoided = sale.status === 'voided';
                    return (
                      <tr
                        key={sale.id}
                        className={isVoided ? 'bg-[#FAF8F5]/60 opacity-75' : 'hover:bg-[#FAF8F5]/75'}
                      >
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-[#231712] whitespace-nowrap">
                          {sale.receiptNumber}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-[#766257] whitespace-nowrap">
                          {sale.saleDate}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-[#231712]">
                            {sale.customerName || 'Walk-in Client'}
                          </p>
                          {sale.customerPhone && (
                            <p className="text-xs font-mono text-[#766257]">{sale.customerPhone}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-[#5C493F] max-w-xs">
                          {sale.items.map((li) => `${li.name} ×${li.quantity}`).join(' · ')}
                        </td>
                        <td className="px-4 py-3 text-xs text-[#5C493F] whitespace-nowrap">
                          {sale.cashierName}
                        </td>
                        <td className="px-4 py-3 text-xs text-[#231712] whitespace-nowrap">
                          {sale.paymentMethod}
                        </td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          <span
                            className={
                              isVoided
                                ? 'text-[#D0311E] font-semibold'
                                : 'text-[#16A34A] font-semibold'
                            }
                          >
                            {isVoided ? 'Voided' : 'Completed'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums text-right whitespace-nowrap">
                          <span
                            className={`font-semibold ${
                              isVoided ? 'line-through text-[#766257]' : 'text-[#231712]'
                            }`}
                          >
                            {formatCurrency(sale.total)}
                          </span>
                          {sale.discount > 0 && (
                            <p className="text-[11px] text-[#D0311E]">
                              -{formatCurrency(sale.discount)} disc.
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => setSelectedReceipt(sale)}
                              aria-label={`View receipt ${sale.receiptNumber}`}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-[#231712] hover:text-[#BE1A1A] cursor-pointer"
                            >
                              <Receipt className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Receipt</span>
                            </button>
                            {canVoid && !isVoided && (
                              <button
                                type="button"
                                onClick={() => setConfirmVoidSale(sale)}
                                aria-label={`Void sale ${sale.receiptNumber}`}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-[#D0311E] hover:text-[#BE1A1A] cursor-pointer"
                              >
                                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Void</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Printable Receipt Detail Modal */}
      {selectedReceipt && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ledger-receipt-title"
          className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="bg-white border border-[#E8DFD3] rounded-t-2xl sm:rounded-2xl max-w-md w-full p-5 sm:p-6 max-h-[92dvh] overflow-y-auto pb-safe print-only-sheet">
            <div className="flex items-center justify-between mb-4 no-print">
              <h2 id="ledger-receipt-title" className="font-display text-lg font-semibold text-[#231712]">
                Receipt {selectedReceipt.receiptNumber}
              </h2>
              <button
                type="button"
                onClick={() => setSelectedReceipt(null)}
                aria-label="Close receipt modal"
                className="p-1.5 rounded-lg text-[#766257] hover:bg-[#FAF8F5] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="border border-[#E8DFD3] rounded-xl p-5 bg-[#FAF8F5]/50 text-center space-y-3">
              <img
                src="./assets/aistudio/image_89dfb75c.png"
                alt="ELA Jewelry"
                className="h-16 mx-auto object-contain"
                referrerPolicy="no-referrer"
              />
              <div className="text-xs text-[#766257]">
                <p className="font-semibold text-[#231712]">ELA Jewellery and Accessories</p>
                <p className="font-mono mt-0.5">
                  Receipt {selectedReceipt.receiptNumber} · {selectedReceipt.saleDate}
                </p>
                <p className="mt-0.5">
                  Client: {selectedReceipt.customerName || 'Walk-in Client'} · Paid via{' '}
                  {selectedReceipt.paymentMethod}
                </p>
                {selectedReceipt.status === 'voided' && (
                  <p className="font-semibold text-[#D0311E] mt-1 uppercase tracking-wider">
                    Voided Transaction
                  </p>
                )}
              </div>

              <div className="border-t border-b border-dashed border-[#D8CBBF] py-3 text-left space-y-1.5 text-xs">
                {selectedReceipt.items.map((line, idx) => (
                  <div key={`${line.itemId}-${idx}`} className="flex justify-between gap-2">
                    <span className="text-[#231712]">
                      {line.name} ×{line.quantity}
                    </span>
                    <span className="font-mono tabular-nums font-medium">
                      {formatCurrency(line.lineTotal)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="text-xs space-y-1">
                {selectedReceipt.discount > 0 && (
                  <div className="flex justify-between text-[#D0311E]">
                    <span>Discount</span>
                    <span className="font-mono tabular-nums">
                      -{formatCurrency(selectedReceipt.discount)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold text-[#231712]">
                  <span>Total</span>
                  <span className="font-mono tabular-nums">
                    {formatCurrency(selectedReceipt.total)}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-[#766257] pt-1">
                Served by {selectedReceipt.cashierName} · Thank you for shopping with ELA
              </p>
            </div>

            <div className="mt-5 grid grid-cols-2 sm:flex sm:items-center sm:justify-end gap-2.5 no-print">
              <button
                type="button"
                onClick={() => window.print()}
                className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-[#E8DFD3] hover:bg-[#FAF8F5] text-[#231712] cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Print Receipt</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedReceipt(null)}
                className="min-h-[44px] px-4 py-2 text-xs font-semibold rounded-lg bg-[#BE1A1A] hover:bg-[#D0311E] text-white cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Void Confirmation Modal */}
      {confirmVoidSale && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="void-sale-title"
          className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="bg-white border border-[#E8DFD3] rounded-t-2xl sm:rounded-2xl max-w-md w-full p-5 sm:p-6 space-y-4 pb-safe">
            <div className="flex items-center justify-between">
              <h2 id="void-sale-title" className="font-display text-lg font-semibold text-[#231712]">
                Void Sale {confirmVoidSale.receiptNumber}?
              </h2>
              <button
                type="button"
                onClick={() => setConfirmVoidSale(null)}
                aria-label="Cancel void"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-[#766257] hover:bg-[#FAF8F5] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-[#766257] leading-relaxed">
              This will mark receipt{' '}
              <span className="font-mono font-semibold text-[#231712]">
                {confirmVoidSale.receiptNumber}
              </span>{' '}
              ({formatCurrency(confirmVoidSale.total)}) as voided and automatically restore all sold
              quantities back to shared inventory.
            </p>
            <div className="grid grid-cols-2 sm:flex sm:items-center sm:justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmVoidSale(null)}
                className="min-h-[44px] px-4 py-2 text-xs font-semibold rounded-lg border border-[#E8DFD3] hover:bg-[#FAF8F5] text-[#231712] cursor-pointer"
              >
                Keep Sale
              </button>
              <button
                type="button"
                onClick={handleConfirmVoid}
                disabled={voidingId === confirmVoidSale.id}
                className="min-h-[44px] px-4 py-2 text-xs font-semibold rounded-lg bg-[#BE1A1A] hover:bg-[#D0311E] disabled:opacity-60 text-white cursor-pointer"
              >
                {voidingId === confirmVoidSale.id ? 'Voiding...' : 'Confirm Void'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
