import React, { useMemo, useState } from 'react';
import { Plus, Trash2, CheckCircle2, X } from 'lucide-react';
import { usePos } from '../context/PosContext';
import {
  PURCHASE_PAYMENT_METHODS,
  PurchaseLineItem,
  PurchasePaymentMethod,
} from '../types/pos';
import { formatCurrency, getTodayDateString, roundMoney } from '../utils/posLogic';

interface DraftLine {
  itemId: string;
  quantity: string;
  unitCost: string;
}

export const PurchasesView: React.FC = () => {
  const { inventory, purchases, recordPurchase, settleSupplierPurchase, notify } = usePos();

  const [modalOpen, setModalOpen] = useState(false);
  const [supplierName, setSupplierName] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(getTodayDateString());
  const [paymentStatus, setPaymentStatus] = useState<'Paid' | 'Supplier Credit'>('Paid');
  const [paymentMethod, setPaymentMethod] = useState<PurchasePaymentMethod>('Bank Transfer');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const openModal = () => {
    const firstItem = inventory[0];
    setSupplierName(firstItem?.supplier || '');
    setInvoiceNumber(`PO-${Date.now().toString().slice(-5)}`);
    setPurchaseDate(getTodayDateString());
    setPaymentStatus('Paid');
    setPaymentMethod('Bank Transfer');
    setNotes('');
    setLines(
      firstItem
        ? [{ itemId: firstItem.id, quantity: '5', unitCost: String(firstItem.costPrice) }]
        : []
    );
    setModalOpen(true);
  };

  const addLine = () => {
    const fallback = inventory[0];
    if (!fallback) return;
    setLines((prev) => [
      ...prev,
      { itemId: fallback.id, quantity: '1', unitCost: String(fallback.costPrice) },
    ]);
  };

  const updateLine = (idx: number, patch: Partial<DraftLine>) => {
    setLines((prev) =>
      prev.map((line, i) => {
        if (i !== idx) return line;
        const next = { ...line, ...patch };
        if (patch.itemId) {
          const matched = inventory.find((it) => it.id === patch.itemId);
          if (matched) {
            next.unitCost = String(matched.costPrice);
          }
        }
        return next;
      })
    );
  };

  const removeLine = (idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const draftTotal = useMemo(() => {
    return roundMoney(
      lines.reduce((sum, l) => {
        const q = Math.max(0, Number(l.quantity) || 0);
        const c = Math.max(0, Number(l.unitCost) || 0);
        return sum + q * c;
      }, 0)
    );
  }, [lines]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierName.trim()) {
      notify('error', 'Supplier name is required.');
      return;
    }
    const builtItems: PurchaseLineItem[] = [];
    for (const l of lines) {
      const item = inventory.find((it) => it.id === l.itemId);
      const qty = Math.floor(Number(l.quantity) || 0);
      const unitCost = roundMoney(Math.max(0, Number(l.unitCost) || 0));
      if (!item || qty <= 0) continue;
      builtItems.push({
        itemId: item.id,
        sku: item.sku,
        name: item.name,
        quantity: qty,
        unitCost,
        lineTotal: roundMoney(qty * unitCost),
      });
    }

    if (builtItems.length === 0) {
      notify('error', 'Add at least one valid product line with quantity greater than 0.');
      return;
    }

    setSubmitting(true);
    try {
      await recordPurchase({
        invoiceNumber: invoiceNumber.trim(),
        supplierName: supplierName.trim(),
        items: builtItems,
        paymentStatus,
        paymentMethod: paymentStatus === 'Supplier Credit' ? 'Supplier Credit' : paymentMethod,
        notes: notes.trim(),
        purchaseDate,
      });
      setModalOpen(false);
    } catch {
      // handled by context toast
    } finally {
      setSubmitting(false);
    }
  };

  const totalSpend = useMemo(
    () => roundMoney(purchases.reduce((sum, p) => sum + p.totalCost, 0)),
    [purchases]
  );
  const unpaidCredit = useMemo(
    () =>
      roundMoney(
        purchases
          .filter((p) => p.paymentStatus === 'Supplier Credit')
          .reduce((sum, p) => sum + p.totalCost, 0)
      ),
    [purchases]
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-semibold text-[#231712]">
            Supplier Purchases &amp; Restocking
          </h1>
          <p className="text-xs sm:text-sm text-[#766257] mt-0.5">
            Record incoming stock shipments · Inventory counts &amp; weighted cost update automatically
          </p>
        </div>
        <button
          type="button"
          onClick={openModal}
          disabled={inventory.length === 0}
          className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#BE1A1A] hover:bg-[#D0311E] disabled:bg-[#D5C9BE] text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>Record Purchase</span>
        </button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-4">
        <div className="bg-white border border-[#E8DFD3] rounded-xl p-3.5 sm:p-4">
          <p className="text-xs text-[#766257]">Purchase Orders</p>
          <p className="font-mono tabular-nums text-lg sm:text-xl font-semibold text-[#231712] mt-1">
            {purchases.length}
          </p>
        </div>
        <div className="bg-white border border-[#E8DFD3] rounded-xl p-3.5 sm:p-4">
          <p className="text-xs text-[#766257]">Procurement Spend</p>
          <p className="font-mono tabular-nums text-lg sm:text-xl font-semibold text-[#231712] mt-1">
            {formatCurrency(totalSpend)}
          </p>
        </div>
        <div className="col-span-2 sm:col-span-1 bg-white border border-[#E8DFD3] rounded-xl p-3.5 sm:p-4">
          <p className="text-xs text-[#766257]">Outstanding Supplier Credit</p>
          <p className="font-mono tabular-nums text-lg sm:text-xl font-semibold text-[#D0311E] mt-1">
            {formatCurrency(unpaidCredit)}
          </p>
        </div>
      </div>

      {/* Purchase Ledger Cards (Mobile) & Table (Desktop) */}
      <div className="bg-white border border-[#E8DFD3] rounded-xl overflow-hidden">
        {purchases.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#766257]">
            No supplier purchases recorded yet. Click &ldquo;Record Purchase&rdquo; to restock
            inventory.
          </div>
        ) : (
          <>
            {/* Mobile Purchase Cards */}
            <ul className="md:hidden divide-y divide-[#E8DFD3]">
              {purchases.map((po) => (
                <li key={po.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono font-semibold text-[#231712]">
                          {po.invoiceNumber}
                        </span>
                        <span className="text-[#C8B9AE]" aria-hidden="true">
                          ·
                        </span>
                        <span className="font-mono text-[#766257]">{po.purchaseDate}</span>
                      </div>
                      <p className="text-sm font-semibold text-[#231712] mt-0.5 truncate">
                        {po.supplierName}
                      </p>
                      {po.notes && <p className="text-xs text-[#766257] mt-0.5">{po.notes}</p>}
                    </div>
                    <span className="font-mono tabular-nums text-base font-semibold text-[#231712] shrink-0">
                      {formatCurrency(po.totalCost)}
                    </span>
                  </div>

                  <p className="text-xs text-[#5C493F]">
                    {po.items.map((li) => `${li.name} (+${li.quantity})`).join(' · ')}
                  </p>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-xs">
                      <span
                        className={
                          po.paymentStatus === 'Paid'
                            ? 'text-[#16A34A] font-semibold'
                            : 'text-[#D0311E] font-semibold'
                        }
                      >
                        {po.paymentStatus}
                      </span>
                      <span className="text-[#766257]"> · {po.paymentMethod}</span>
                    </span>

                    {po.paymentStatus === 'Supplier Credit' ? (
                      <button
                        type="button"
                        onClick={() => settleSupplierPurchase(po.id, 'Bank Transfer')}
                        aria-label={`Mark purchase ${po.invoiceNumber} as paid`}
                        className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#BE1A1A]/35 text-xs font-semibold text-[#BE1A1A] hover:bg-[#FCE8E6] cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Mark Paid</span>
                      </button>
                    ) : (
                      <span className="text-xs text-[#766257]">Settled</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-[#FAF8F5] text-xs text-[#766257] border-b border-[#E8DFD3]">
                  <tr>
                    <th className="px-4 py-3 font-medium">Invoice #</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Supplier</th>
                    <th className="px-4 py-3 font-medium">Items Restocked</th>
                    <th className="px-4 py-3 font-medium">Payment</th>
                    <th className="px-4 py-3 font-medium text-right">Total Cost</th>
                    <th className="px-4 py-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8DFD3]">
                  {purchases.map((po) => (
                    <tr key={po.id} className="hover:bg-[#FAF8F5]/75">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-[#231712] whitespace-nowrap">
                        {po.invoiceNumber}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[#766257] whitespace-nowrap">
                        {po.purchaseDate}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-[#231712]">{po.supplierName}</p>
                        {po.notes && <p className="text-xs text-[#766257]">{po.notes}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#5C493F]">
                        {po.items.map((li) => `${li.name} (+${li.quantity})`).join(' · ')}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        <span
                          className={
                            po.paymentStatus === 'Paid'
                              ? 'text-[#16A34A] font-semibold'
                              : 'text-[#D0311E] font-semibold'
                          }
                        >
                          {po.paymentStatus}
                        </span>
                        <span className="text-[#766257]"> · {po.paymentMethod}</span>
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-right font-semibold text-[#231712]">
                        {formatCurrency(po.totalCost)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {po.paymentStatus === 'Supplier Credit' ? (
                          <button
                            type="button"
                            onClick={() => settleSupplierPurchase(po.id, 'Bank Transfer')}
                            aria-label={`Mark purchase ${po.invoiceNumber} as paid`}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#BE1A1A] hover:text-[#D0311E] cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Mark Paid</span>
                          </button>
                        ) : (
                          <span className="text-xs text-[#766257]">Settled</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Record Purchase Modal */}
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="purchase-modal-title"
          className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <form
            onSubmit={handleSubmit}
            className="bg-white border border-[#E8DFD3] rounded-t-2xl sm:rounded-2xl max-w-2xl w-full p-5 sm:p-6 space-y-4 max-h-[92dvh] overflow-y-auto pb-safe"
          >
            <div className="flex items-center justify-between border-b border-[#E8DFD3] pb-3">
              <h2
                id="purchase-modal-title"
                className="font-display text-xl font-semibold text-[#231712]"
              >
                Record Supplier Purchase Order
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close purchase modal"
                className="p-1.5 rounded-lg text-[#766257] hover:bg-[#FAF8F5] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="po-supplier" className="block text-xs font-semibold text-[#231712] mb-1">
                  Supplier Name *
                </label>
                <input
                  id="po-supplier"
                  type="text"
                  required
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="e.g., Aurelia Fine Metals"
                  className="w-full px-3 py-2 text-sm bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg focus:outline-none focus:border-[#BE1A1A]"
                />
              </div>

              <div>
                <label htmlFor="po-invoice" className="block text-xs font-semibold text-[#231712] mb-1">
                  Invoice Number *
                </label>
                <input
                  id="po-invoice"
                  type="text"
                  required
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg focus:outline-none focus:border-[#BE1A1A]"
                />
              </div>

              <div>
                <label htmlFor="po-date" className="block text-xs font-semibold text-[#231712] mb-1">
                  Purchase Date
                </label>
                <input
                  id="po-date"
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg focus:outline-none focus:border-[#BE1A1A]"
                />
              </div>
            </div>

            {/* Line Items */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#231712]">
                  Products Received (Auto-increments Inventory)
                </span>
                <button
                  type="button"
                  onClick={addLine}
                  className="text-xs font-semibold text-[#BE1A1A] hover:underline cursor-pointer"
                >
                  + Add Product Line
                </button>
              </div>

              {lines.map((line, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-2 items-end sm:items-center bg-[#FAF8F5] p-2.5 rounded-lg border border-[#E8DFD3]"
                >
                  <div className="col-span-12 sm:col-span-6">
                    <label htmlFor={`po-item-${idx}`} className="block text-[11px] font-medium text-[#5C493F] mb-1 sm:sr-only">
                      Product
                    </label>
                    <select
                      id={`po-item-${idx}`}
                      value={line.itemId}
                      onChange={(e) => updateLine(idx, { itemId: e.target.value })}
                      className="w-full px-2.5 py-2 sm:py-1.5 text-xs bg-white border border-[#E8DFD3] rounded-md"
                    >
                      {inventory.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.sku} — {it.name} (Stock: {it.quantity})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-5 sm:col-span-2">
                    <label htmlFor={`po-qty-${idx}`} className="block text-[11px] font-medium text-[#5C493F] mb-1 sm:sr-only">
                      Qty
                    </label>
                    <input
                      id={`po-qty-${idx}`}
                      type="number"
                      min="1"
                      value={line.quantity}
                      onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                      placeholder="Qty"
                      className="w-full px-2.5 py-2 sm:py-1.5 text-sm sm:text-xs font-mono tabular-nums bg-white border border-[#E8DFD3] rounded-md"
                    />
                  </div>
                  <div className="col-span-5 sm:col-span-3">
                    <label htmlFor={`po-cost-${idx}`} className="block text-[11px] font-medium text-[#5C493F] mb-1 sm:sr-only">
                      Unit Cost ($)
                    </label>
                    <input
                      id={`po-cost-${idx}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.unitCost}
                      onChange={(e) => updateLine(idx, { unitCost: e.target.value })}
                      placeholder="Unit Cost $"
                      className="w-full px-2.5 py-2 sm:py-1.5 text-sm sm:text-xs font-mono tabular-nums bg-white border border-[#E8DFD3] rounded-md"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      aria-label={`Remove purchase line ${idx + 1}`}
                      className="min-w-[38px] min-h-[38px] sm:min-w-0 sm:min-h-0 flex items-center justify-center p-1.5 text-[#766257] hover:text-[#BE1A1A] cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="po-status" className="block text-xs font-semibold text-[#231712] mb-1">
                  Payment Status
                </label>
                <select
                  id="po-status"
                  value={paymentStatus}
                  onChange={(e) => {
                    const next = e.target.value as 'Paid' | 'Supplier Credit';
                    setPaymentStatus(next);
                    if (next === 'Supplier Credit') setPaymentMethod('Supplier Credit');
                    else if (paymentMethod === 'Supplier Credit') setPaymentMethod('Bank Transfer');
                  }}
                  className="w-full px-3 py-2 text-sm bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg"
                >
                  <option value="Paid">Paid</option>
                  <option value="Supplier Credit">Supplier Credit (Pay Later)</option>
                </select>
              </div>

              <div>
                <label htmlFor="po-method" className="block text-xs font-semibold text-[#231712] mb-1">
                  Payment Method
                </label>
                <select
                  id="po-method"
                  value={paymentMethod}
                  disabled={paymentStatus === 'Supplier Credit'}
                  onChange={(e) => setPaymentMethod(e.target.value as PurchasePaymentMethod)}
                  className="w-full px-3 py-2 text-sm bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg disabled:opacity-60"
                >
                  {PURCHASE_PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="po-notes" className="block text-xs font-semibold text-[#231712] mb-1">
                  Shipment Notes
                </label>
                <input
                  id="po-notes"
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional reference, freight note, or wholesale terms"
                  className="w-full px-3 py-2 text-base sm:text-sm bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-[#E8DFD3] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center justify-between sm:block">
                <p className="text-xs text-[#766257]">Total Purchase Cost</p>
                <p className="font-mono tabular-nums text-lg font-bold text-[#BE1A1A]">
                  {formatCurrency(draftTotal)}
                </p>
              </div>
              <div className="grid grid-cols-2 sm:flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="min-h-[44px] px-4 py-2 text-sm font-medium text-[#5C493F] border border-[#E8DFD3] sm:border-transparent hover:bg-[#FAF8F5] rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[44px] px-5 py-2 text-sm font-semibold bg-[#BE1A1A] hover:bg-[#D0311E] text-white rounded-lg cursor-pointer whitespace-nowrap"
                >
                  {submitting ? 'Saving...' : 'Confirm Purchase'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
