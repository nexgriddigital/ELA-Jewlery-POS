import React, { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { usePos } from '../context/PosContext';
import { DateRange } from '../types/pos';
import {
  calculateInventoryValuation,
  formatCurrency,
  generatePurchaseReport,
  generateSalesReport,
  getTodayDateString,
  toCsv,
} from '../utils/posLogic';

type ReportTab = 'sales' | 'purchases' | 'valuation';

function offsetDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return getTodayDateString(d);
}

export const ReportsView: React.FC = () => {
  const { sales, purchases, inventory } = usePos();

  const today = getTodayDateString();
  const [activeTab, setActiveTab] = useState<ReportTab>('sales');
  const [range, setRange] = useState<DateRange>({
    from: offsetDays(30),
    to: today,
  });

  const salesReport = useMemo(() => generateSalesReport(sales, range), [sales, range]);
  const purchaseReport = useMemo(
    () => generatePurchaseReport(purchases, range),
    [purchases, range]
  );
  const valuation = useMemo(() => calculateInventoryValuation(inventory), [inventory]);

  const applyPreset = (preset: 'today' | '7d' | '30d' | 'year' | 'all') => {
    const now = new Date();
    const to = getTodayDateString(now);
    if (preset === 'today') setRange({ from: to, to });
    else if (preset === '7d') setRange({ from: offsetDays(7), to });
    else if (preset === '30d') setRange({ from: offsetDays(30), to });
    else if (preset === 'year') setRange({ from: `${now.getFullYear()}-01-01`, to });
    else setRange({ from: '', to: '' });
  };

  const downloadCsv = (filename: string, csvText: string) => {
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportCurrent = () => {
    if (activeTab === 'sales') {
      const csv = toCsv(
        ['Receipt', 'Date', 'Customer', 'Payment Method', 'Subtotal', 'Discount', 'Total', 'COGS', 'Profit'],
        salesReport.sales.map((s) => [
          s.receiptNumber,
          s.saleDate,
          s.customerName,
          s.paymentMethod,
          s.subtotal,
          s.discount,
          s.total,
          s.totalCost,
          s.total - s.totalCost,
        ])
      );
      downloadCsv(`ela-sales-report-${range.from || 'all'}-to-${range.to || 'now'}.csv`, csv);
    } else if (activeTab === 'purchases') {
      const csv = toCsv(
        ['Invoice', 'Date', 'Supplier', 'Payment Status', 'Method', 'Total Cost'],
        purchaseReport.purchases.map((p) => [
          p.invoiceNumber,
          p.purchaseDate,
          p.supplierName,
          p.paymentStatus,
          p.paymentMethod,
          p.totalCost,
        ])
      );
      downloadCsv(`ela-purchase-report-${range.from || 'all'}-to-${range.to || 'now'}.csv`, csv);
    } else {
      const csv = toCsv(
        ['SKU', 'Product', 'Category', 'Quantity', 'Unit Cost', 'Unit Retail', 'Total Cost Value', 'Total Retail Value'],
        inventory.map((it) => [
          it.sku,
          it.name,
          it.category,
          it.quantity,
          it.costPrice,
          it.retailPrice,
          it.costPrice * it.quantity,
          it.retailPrice * it.quantity,
        ])
      );
      downloadCsv(`ela-inventory-valuation-${today}.csv`, csv);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Export */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-semibold text-[#231712]">
            Financial &amp; Inventory Reports
          </h1>
          <p className="text-xs sm:text-sm text-[#766257] mt-0.5">
            Date-range sales with payment breakdown, purchases &amp; real-time retail/cost valuation
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportCurrent}
          className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-[#E8DFD3] hover:bg-[#F8EBAB]/40 text-[#231712] text-sm font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
        >
          <Download className="w-4 h-4 text-[#BE1A1A]" aria-hidden="true" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Report Tabs + Date Range Controls */}
      <div className="bg-white border border-[#E8DFD3] rounded-xl p-3 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
        <div
          role="tablist"
          aria-label="Report type"
          className="grid grid-cols-3 sm:inline-flex w-full sm:w-auto items-center gap-1 bg-[#FAF8F5] p-1 rounded-lg border border-[#E8DFD3]"
        >
          {(
            [
              { id: 'sales', shortLabel: 'Sales', label: 'Sales Report' },
              { id: 'purchases', shortLabel: 'Purchases', label: 'Purchase Report' },
              { id: 'valuation', shortLabel: 'Valuation', label: 'Inventory Valuation' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-[40px] sm:min-h-0 px-2 sm:px-3.5 py-2 sm:py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap truncate ${
                activeTab === tab.id
                  ? 'bg-[#BE1A1A] text-white'
                  : 'text-[#5C493F] hover:text-[#231712]'
              }`}
            >
              <span className="sm:hidden">{tab.shortLabel}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {activeTab !== 'valuation' && (
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 text-xs w-full lg:w-auto">
            <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-1.5">
                <label htmlFor="report-from" className="text-[11px] sm:text-xs text-[#766257]">
                  From
                </label>
                <input
                  id="report-from"
                  type="date"
                  value={range.from}
                  onChange={(e) => setRange({ ...range, from: e.target.value })}
                  className="w-full sm:w-auto px-2.5 py-2 sm:py-1.5 text-base sm:text-xs font-mono bg-[#FAF8F5] border border-[#E8DFD3] rounded-md"
                />
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-1.5">
                <label htmlFor="report-to" className="text-[11px] sm:text-xs text-[#766257]">
                  To
                </label>
                <input
                  id="report-to"
                  type="date"
                  value={range.to}
                  onChange={(e) => setRange({ ...range, to: e.target.value })}
                  className="w-full sm:w-auto px-2.5 py-2 sm:py-1.5 text-base sm:text-xs font-mono bg-[#FAF8F5] border border-[#E8DFD3] rounded-md"
                />
              </div>
            </div>
            <div className="grid grid-cols-5 sm:flex items-center gap-1">
              {(
                [
                  { id: 'today', label: 'Today' },
                  { id: '7d', label: '7D' },
                  { id: '30d', label: '30D' },
                  { id: 'year', label: 'Year' },
                  { id: 'all', label: 'All' },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  className="min-h-[38px] sm:min-h-0 px-2 sm:px-2.5 py-1.5 rounded-md bg-[#FAF8F5] hover:bg-[#F8EBAB]/60 border border-[#E8DFD3] text-[#231712] font-medium cursor-pointer whitespace-nowrap"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 6.1 SALES REPORT (With Payment Methods Breakdown) */}
      {activeTab === 'sales' && (
        <div className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
            <div className="bg-white border border-[#E8DFD3] rounded-xl p-3.5 sm:p-4">
              <p className="text-xs text-[#766257]">Gross Sales Revenue</p>
              <p className="font-mono tabular-nums text-lg sm:text-2xl font-semibold text-[#BE1A1A] mt-1">
                {formatCurrency(salesReport.grossRevenue)}
              </p>
              <p className="text-[11px] sm:text-xs text-[#766257] mt-1">
                {salesReport.transactionCount} receipts · {salesReport.unitsSold} units
              </p>
            </div>
            <div className="bg-white border border-[#E8DFD3] rounded-xl p-3.5 sm:p-4">
              <p className="text-xs text-[#766257]">Cost of Goods Sold</p>
              <p className="font-mono tabular-nums text-lg sm:text-2xl font-semibold text-[#231712] mt-1">
                {formatCurrency(salesReport.totalCostOfGoods)}
              </p>
            </div>
            <div className="bg-white border border-[#E8DFD3] rounded-xl p-3.5 sm:p-4">
              <p className="text-xs text-[#766257]">Net Profit</p>
              <p className="font-mono tabular-nums text-lg sm:text-2xl font-semibold text-[#16A34A] mt-1">
                {formatCurrency(salesReport.netProfit)}
              </p>
              <p className="text-[11px] sm:text-xs font-mono text-[#766257] mt-1">
                {salesReport.profitMarginPercent}% margin
              </p>
            </div>
            <div className="bg-white border border-[#E8DFD3] rounded-xl p-3.5 sm:p-4">
              <p className="text-xs text-[#766257]">Discounts Granted</p>
              <p className="font-mono tabular-nums text-lg sm:text-2xl font-semibold text-[#231712] mt-1">
                {formatCurrency(salesReport.totalDiscounts)}
              </p>
            </div>
          </div>

          {/* Payment Methods Breakdown */}
          <div className="bg-white border border-[#E8DFD3] rounded-xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <h2 className="font-display text-base sm:text-lg font-semibold text-[#231712]">
                Payment Methods Breakdown
              </h2>
              <span className="text-xs text-[#766257]">
                {range.from || 'Beginning'} to {range.to || 'Present'}
              </span>
            </div>

            <div className="space-y-3">
              {salesReport.byPaymentMethod.map((pm) => (
                <div key={pm.method} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-[#231712]">
                      {pm.method}{' '}
                      <span className="font-normal text-[#766257]">({pm.count} sales)</span>
                    </span>
                    <span className="font-mono tabular-nums font-semibold text-[#231712] shrink-0">
                      {formatCurrency(pm.total)}{' '}
                      <span className="text-[#766257] font-normal">({pm.sharePercent}%)</span>
                    </span>
                  </div>
                  <div className="h-2.5 bg-[#FAF8F5] rounded-full overflow-hidden border border-[#E8DFD3]">
                    <div
                      className="h-full bg-[#BE1A1A] rounded-full transition-all"
                      style={{ width: `${Math.min(100, pm.sharePercent)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Itemized Sales Ledger */}
          <div className="bg-white border border-[#E8DFD3] rounded-xl overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-[#E8DFD3]">
              <h2 className="text-sm font-semibold text-[#231712]">Sales Ledger in Range</h2>
            </div>
            {salesReport.sales.length === 0 ? (
              <p className="p-8 text-center text-sm text-[#766257]">
                No completed sales in the selected date range.
              </p>
            ) : (
              <>
                <div className="md:hidden divide-y divide-[#E8DFD3]">
                  {salesReport.sales.map((s) => (
                    <div key={s.id} className="p-3.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#231712] truncate">
                          {s.customerName}
                        </p>
                        <p className="text-[11px] font-mono text-[#766257] mt-0.5">
                          {s.receiptNumber} · {s.saleDate}
                        </p>
                        <p className="text-[11px] text-[#5C493F] font-medium mt-0.5">
                          {s.paymentMethod}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono tabular-nums text-sm font-semibold text-[#231712]">
                          {formatCurrency(s.total)}
                        </p>
                        <p className="font-mono tabular-nums text-[11px] text-[#16A34A] mt-0.5">
                          +{formatCurrency(s.total - s.totalCost)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-[#FAF8F5] text-xs text-[#766257] border-b border-[#E8DFD3]">
                      <tr>
                        <th className="px-4 py-3 font-medium">Receipt</th>
                        <th className="px-4 py-3 font-medium">Date</th>
                        <th className="px-4 py-3 font-medium">Client</th>
                        <th className="px-4 py-3 font-medium">Payment Method</th>
                        <th className="px-4 py-3 font-medium text-right">Total</th>
                        <th className="px-4 py-3 font-medium text-right">Profit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8DFD3]">
                      {salesReport.sales.map((s) => (
                        <tr key={s.id} className="hover:bg-[#FAF8F5]/75">
                          <td className="px-4 py-2.5 font-mono text-xs font-semibold text-[#231712]">
                            {s.receiptNumber}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs text-[#766257]">
                            {s.saleDate}
                          </td>
                          <td className="px-4 py-2.5 text-[#231712]">{s.customerName}</td>
                          <td className="px-4 py-2.5 font-medium text-[#5C493F]">
                            {s.paymentMethod}
                          </td>
                          <td className="px-4 py-2.5 font-mono tabular-nums text-right font-semibold text-[#231712]">
                            {formatCurrency(s.total)}
                          </td>
                          <td className="px-4 py-2.5 font-mono tabular-nums text-right text-[#16A34A]">
                            {formatCurrency(s.total - s.totalCost)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 6.2 PURCHASE REPORT */}
      {activeTab === 'purchases' && (
        <div className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
            <div className="bg-white border border-[#E8DFD3] rounded-xl p-3.5 sm:p-4">
              <p className="text-xs text-[#766257]">Total Purchase Spend</p>
              <p className="font-mono tabular-nums text-lg sm:text-2xl font-semibold text-[#231712] mt-1">
                {formatCurrency(purchaseReport.totalSpend)}
              </p>
              <p className="text-[11px] sm:text-xs text-[#766257] mt-1">
                {purchaseReport.orderCount} orders · {purchaseReport.unitsPurchased} units
              </p>
            </div>
            <div className="bg-white border border-[#E8DFD3] rounded-xl p-3.5 sm:p-4">
              <p className="text-xs text-[#766257]">Paid Purchases</p>
              <p className="font-mono tabular-nums text-lg sm:text-2xl font-semibold text-[#16A34A] mt-1">
                {formatCurrency(purchaseReport.paidSpend)}
              </p>
            </div>
            <div className="bg-white border border-[#E8DFD3] rounded-xl p-3.5 sm:p-4">
              <p className="text-xs text-[#766257]">Supplier Credit</p>
              <p className="font-mono tabular-nums text-lg sm:text-2xl font-semibold text-[#D0311E] mt-1">
                {formatCurrency(purchaseReport.supplierCreditSpend)}
              </p>
            </div>
            <div className="bg-white border border-[#E8DFD3] rounded-xl p-3.5 sm:p-4">
              <p className="text-xs text-[#766257]">Active Suppliers</p>
              <p className="font-mono tabular-nums text-lg sm:text-2xl font-semibold text-[#231712] mt-1">
                {purchaseReport.bySupplier.length}
              </p>
            </div>
          </div>

          <div className="bg-white border border-[#E8DFD3] rounded-xl overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-[#E8DFD3]">
              <h2 className="text-sm font-semibold text-[#231712]">Spend by Supplier</h2>
            </div>
            {purchaseReport.bySupplier.length === 0 ? (
              <p className="p-8 text-center text-sm text-[#766257]">
                No purchases recorded in the selected range.
              </p>
            ) : (
              <>
                <div className="md:hidden divide-y divide-[#E8DFD3]">
                  {purchaseReport.bySupplier.map((sup) => (
                    <div
                      key={sup.supplierName}
                      className="p-3.5 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#231712] truncate">
                          {sup.supplierName}
                        </p>
                        <p className="text-[11px] font-mono text-[#766257] mt-0.5">
                          {sup.orderCount} order(s)
                        </p>
                      </div>
                      <span className="font-mono tabular-nums text-sm font-semibold text-[#231712] shrink-0">
                        {formatCurrency(sup.totalCost)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-[#FAF8F5] text-xs text-[#766257] border-b border-[#E8DFD3]">
                      <tr>
                        <th className="px-4 py-3 font-medium">Supplier</th>
                        <th className="px-4 py-3 font-medium text-right">Orders</th>
                        <th className="px-4 py-3 font-medium text-right">Total Spend</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8DFD3]">
                      {purchaseReport.bySupplier.map((sup) => (
                        <tr key={sup.supplierName} className="hover:bg-[#FAF8F5]/75">
                          <td className="px-4 py-3 font-medium text-[#231712]">
                            {sup.supplierName}
                          </td>
                          <td className="px-4 py-3 font-mono tabular-nums text-right text-[#5C493F]">
                            {sup.orderCount}
                          </td>
                          <td className="px-4 py-3 font-mono tabular-nums text-right font-semibold text-[#231712]">
                            {formatCurrency(sup.totalCost)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 6.3 INVENTORY VALUATION (6.3.1 Retail Value & 6.3.2 Cost Value) */}
      {activeTab === 'valuation' && (
        <div className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
            <div className="bg-[#231712] text-white border border-[#231712] rounded-xl p-3.5 sm:p-5">
              <p className="text-xs text-[#F7D87F]">Total Retail Value</p>
              <p className="font-mono tabular-nums text-lg sm:text-2xl font-bold text-white mt-1.5">
                {formatCurrency(valuation.totalRetailValue)}
              </p>
              <p className="text-[11px] sm:text-xs text-[#C8B9AE] mt-1">
                {valuation.totalUnits} pcs · {valuation.totalSkus} SKUs
              </p>
            </div>
            <div className="bg-white border border-[#E8DFD3] rounded-xl p-3.5 sm:p-5">
              <p className="text-xs text-[#766257]">Total Cost Value</p>
              <p className="font-mono tabular-nums text-lg sm:text-2xl font-bold text-[#231712] mt-1.5">
                {formatCurrency(valuation.totalCostValue)}
              </p>
              <p className="text-[11px] sm:text-xs text-[#766257] mt-1">Capital in stock</p>
            </div>
            <div className="bg-white border border-[#E8DFD3] rounded-xl p-3.5 sm:p-5">
              <p className="text-xs text-[#766257]">Projected Gross Profit</p>
              <p className="font-mono tabular-nums text-lg sm:text-2xl font-bold text-[#16A34A] mt-1.5">
                {formatCurrency(valuation.potentialGrossProfit)}
              </p>
              <p className="text-[11px] sm:text-xs text-[#766257] mt-1">Retail minus Cost</p>
            </div>
            <div className="bg-white border border-[#E8DFD3] rounded-xl p-3.5 sm:p-5">
              <p className="text-xs text-[#766257]">Average Retail Margin</p>
              <p className="font-mono tabular-nums text-lg sm:text-2xl font-bold text-[#BE1A1A] mt-1.5">
                {valuation.averageMarginPercent}%
              </p>
              <p className="text-[11px] sm:text-xs text-[#766257] mt-1">Across boutique lines</p>
            </div>
          </div>

          <div className="bg-white border border-[#E8DFD3] rounded-xl overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-[#E8DFD3]">
              <h2 className="text-sm font-semibold text-[#231712]">
                Valuation Breakdown by Product Category
              </h2>
            </div>

            <div className="md:hidden divide-y divide-[#E8DFD3]">
              {valuation.byCategory.map((row) => (
                <div key={row.category} className="p-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[#231712]">{row.category}</p>
                    <span className="font-mono text-[11px] text-[#766257]">
                      {row.skuCount} SKUs · {row.totalUnits} units
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs bg-[#FAF8F5] border border-[#F0E9DF] rounded-lg p-2">
                    <div>
                      <p className="text-[10px] text-[#766257]">Cost Value</p>
                      <p className="font-mono tabular-nums font-medium text-[#231712]">
                        {formatCurrency(row.costValue)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#766257]">Retail Value</p>
                      <p className="font-mono tabular-nums font-semibold text-[#BE1A1A]">
                        {formatCurrency(row.retailValue)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#766257]">Est. Profit</p>
                      <p className="font-mono tabular-nums font-semibold text-[#16A34A]">
                        {formatCurrency(row.potentialProfit)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-[#FAF8F5] text-xs text-[#766257] border-b border-[#E8DFD3]">
                  <tr>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium text-right">SKUs</th>
                    <th className="px-4 py-3 font-medium text-right">Units</th>
                    <th className="px-4 py-3 font-medium text-right">Cost Value</th>
                    <th className="px-4 py-3 font-medium text-right">Retail Value</th>
                    <th className="px-4 py-3 font-medium text-right">Potential Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8DFD3]">
                  {valuation.byCategory.map((row) => (
                    <tr key={row.category} className="hover:bg-[#FAF8F5]/75">
                      <td className="px-4 py-3 font-semibold text-[#231712]">{row.category}</td>
                      <td className="px-4 py-3 font-mono tabular-nums text-right text-[#5C493F]">
                        {row.skuCount}
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-right text-[#5C493F]">
                        {row.totalUnits}
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-right text-[#231712]">
                        {formatCurrency(row.costValue)}
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-right font-semibold text-[#BE1A1A]">
                        {formatCurrency(row.retailValue)}
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-right font-medium text-[#16A34A]">
                        {formatCurrency(row.potentialProfit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
