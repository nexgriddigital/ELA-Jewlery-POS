import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  Banknote,
  Building2,
  Smartphone,
  BookOpen,
  Printer,
  CheckCircle2,
  ScanLine,
  X,
  Gem,
  ShoppingBag,
  ArrowDown,
  Camera,
} from 'lucide-react';
import { usePos } from '../context/PosContext';
import {
  InventoryItem,
  PAYMENT_METHODS,
  PaymentMethod,
  PRODUCT_CATEGORIES,
  ProductCategory,
  SaleRecord,
} from '../types/pos';
import { computeCartTotals, formatCurrency, getTodayDateString } from '../utils/posLogic';
import { BarcodeScannerModal, BarcodeScanOutcome } from './BarcodeScannerModal';

const ProductCardImage: React.FC<{ src?: string; alt: string }> = ({ src, alt }) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div className="h-28 sm:h-36 w-full rounded-lg bg-[#FAF8F5] border border-[#F0E9DF] mb-2.5 sm:mb-3 flex items-center justify-center text-[#C8B9AE]">
        <Gem className="w-6 h-6 sm:w-7 sm:h-7" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="h-28 sm:h-36 w-full rounded-lg overflow-hidden bg-[#FAF8F5] border border-[#F0E9DF] mb-2.5 sm:mb-3">
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onError={() => setFailed(true)}
        referrerPolicy="no-referrer"
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
      />
    </div>
  );
};

interface CartEntry {
  itemId: string;
  quantity: number;
}

const PAYMENT_ICONS: Record<PaymentMethod, React.ComponentType<{ className?: string }>> = {
  Cash: Banknote,
  Card: CreditCard,
  'Bank Transfer': Building2,
  'Mobile Money': Smartphone,
  'Credit / Tab': BookOpen,
};

export const PosRegisterView: React.FC = () => {
  const { inventory, sales, can, recordSale, voidSale, seedCloudCatalog, syncMode, notify } = usePos();

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'All' | ProductCategory>('All');
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [discountInput, setDiscountInput] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [initialDeposit, setInitialDeposit] = useState('0');
  const [submitting, setSubmitting] = useState(false);
  const [completedReceipt, setCompletedReceipt] = useState<SaleRecord | null>(null);
  const [showRecentSales, setShowRecentSales] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  const filteredInventory = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inventory.filter((item) => {
      if (selectedCategory !== 'All' && item.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        item.barcode.toLowerCase().includes(q)
      );
    });
  }, [inventory, search, selectedCategory]);

  const cartLinesWithItems = useMemo(() => {
    return cart
      .map((entry) => {
        const item = inventory.find((it) => it.id === entry.itemId);
        return item ? { item, quantity: entry.quantity } : null;
      })
      .filter((x): x is { item: InventoryItem; quantity: number } => x !== null);
  }, [cart, inventory]);

  const parsedDiscount = Math.max(0, Number(discountInput) || 0);
  const totals = useMemo(
    () => computeCartTotals(cartLinesWithItems, parsedDiscount),
    [cartLinesWithItems, parsedDiscount]
  );

  const addToCart = (item: InventoryItem) => {
    if (item.quantity <= 0) {
      notify('error', `"${item.name}" is out of stock.`);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((c) => c.itemId === item.id);
      if (existing) {
        if (existing.quantity >= item.quantity) {
          notify('error', `Only ${item.quantity} unit(s) of "${item.name}" available.`);
          return prev;
        }
        return prev.map((c) =>
          c.itemId === item.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, { itemId: item.id, quantity: 1 }];
    });
  };

  const updateCartQty = (itemId: string, delta: number) => {
    const item = inventory.find((it) => it.id === itemId);
    setCart((prev) =>
      prev
        .map((entry) => {
          if (entry.itemId !== itemId) return entry;
          const next = entry.quantity + delta;
          if (item && next > item.quantity) {
            notify('error', `Only ${item.quantity} in stock for "${item.name}".`);
            return entry;
          }
          return { ...entry, quantity: next };
        })
        .filter((entry) => entry.quantity > 0)
    );
  };

  const removeFromCart = (itemId: string) => {
    setCart((prev) => prev.filter((c) => c.itemId !== itemId));
  };

  const handleBarcodeEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const q = search.trim().toLowerCase();
    if (!q) return;
    const exactMatch = inventory.find(
      (i) => i.barcode.toLowerCase() === q || i.sku.toLowerCase() === q
    );
    if (exactMatch) {
      e.preventDefault();
      addToCart(exactMatch);
      setSearch('');
    }
  };

  const handleCameraBarcodeScan = (code: string): BarcodeScanOutcome => {
    const q = code.trim().toLowerCase();
    const match = inventory.find(
      (i) => i.barcode.toLowerCase() === q || i.sku.toLowerCase() === q
    );
    if (!match) {
      return {
        matched: false,
        message: `No catalog item found for barcode "${code}".`,
      };
    }
    if (match.quantity <= 0) {
      notify('error', `"${match.name}" is out of stock.`);
      return {
        matched: false,
        message: `"${match.name}" is out of stock.`,
      };
    }
    const inCart = cart.find((c) => c.itemId === match.id)?.quantity ?? 0;
    if (inCart >= match.quantity) {
      notify('error', `Only ${match.quantity} unit(s) of "${match.name}" available.`);
      return {
        matched: false,
        message: `Stock limit reached (${match.quantity} available) for "${match.name}".`,
      };
    }
    addToCart(match);
    notify('success', `Added "${match.name}" to cart.`);
    return {
      matched: true,
      message: `Added ${match.name} (${formatCurrency(match.retailPrice)})`,
    };
  };

  const handleCompleteSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totals.items.length === 0) {
      notify('error', 'Add at least one item to complete a sale.');
      return;
    }
    if (paymentMethod === 'Credit / Tab' && !customerName.trim()) {
      notify('error', 'Customer name is required when recording a Credit / Tab sale.');
      return;
    }

    setSubmitting(true);
    try {
      const receipt = await recordSale({
        items: totals.items,
        subtotal: totals.subtotal,
        discount: totals.discount,
        total: totals.total,
        totalCost: totals.totalCost,
        paymentMethod,
        customerName: customerName.trim() || 'Walk-in Client',
        customerPhone: customerPhone.trim(),
        dueDate: dueDate || getTodayDateString(),
        initialCreditDeposit: Math.max(0, Number(initialDeposit) || 0),
      });
      setCompletedReceipt(receipt);
      setCart([]);
      setDiscountInput('0');
      setCustomerName('');
      setCustomerPhone('');
      setInitialDeposit('0');
    } catch {
      // Toast already displayed by PosContext
    } finally {
      setSubmitting(false);
    }
  };

  const todaysSalesCount = sales.filter(
    (s) => s.status === 'completed' && s.saleDate === getTodayDateString()
  ).length;

  const scrollToCheckout = () => {
    document.getElementById('pos-checkout-panel')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const cartItemCount = totals.items.reduce((acc, i) => acc + i.quantity, 0);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Sub-header controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-semibold text-[#231712]">
            Point of Sale Register
          </h1>
          <p className="text-xs sm:text-sm text-[#766257] mt-0.5">
            Select items or scan barcode · Inventory deducts automatically on checkout
          </p>
        </div>
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setShowRecentSales((v) => !v)}
            className="flex-1 sm:flex-initial min-h-[42px] px-4 py-2 text-xs sm:text-sm font-medium rounded-lg border border-[#E8DFD3] bg-white hover:bg-[#F8EBAB]/35 text-[#231712] transition-colors cursor-pointer whitespace-nowrap"
          >
            {showRecentSales ? 'Hide Recent Receipts' : `Recent Receipts (${todaysSalesCount} today)`}
          </button>
          {cartItemCount > 0 && (
            <button
              type="button"
              onClick={scrollToCheckout}
              className="xl:hidden min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#231712] text-[#F7D87F] cursor-pointer whitespace-nowrap shrink-0"
            >
              <ShoppingBag className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="font-mono tabular-nums">
                {cartItemCount} · {formatCurrency(totals.total)}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Recent Receipts Table / Mobile Cards */}
      {showRecentSales && (
        <div className="bg-white border border-[#E8DFD3] rounded-xl overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 border-b border-[#E8DFD3] flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[#231712]">Recent Sales Receipts</h2>
            <span className="text-xs text-[#766257]">
              Latest {Math.min(sales.length, 8)}
            </span>
          </div>
          {sales.length === 0 ? (
            <p className="p-6 text-sm text-[#766257]">No sales recorded yet.</p>
          ) : (
            <>
              {/* Mobile Receipts Card List */}
              <ul className="md:hidden divide-y divide-[#E8DFD3]">
                {sales.slice(0, 8).map((sale) => (
                  <li key={sale.id} className="p-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-semibold text-[#231712]">
                          {sale.receiptNumber}
                          {sale.status === 'voided' && (
                            <span className="ml-2 text-[#BE1A1A] font-sans">(Voided)</span>
                          )}
                        </p>
                        <p className="text-sm font-medium text-[#231712] truncate mt-0.5">
                          {sale.customerName}
                        </p>
                        <p className="text-xs text-[#766257]">
                          {sale.saleDate} · {sale.paymentMethod} · {sale.cashierName}
                        </p>
                      </div>
                      <span className="font-mono tabular-nums text-sm font-semibold text-[#231712] shrink-0">
                        {formatCurrency(sale.total)}
                      </span>
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setCompletedReceipt(sale)}
                        className="min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#E8DFD3] bg-[#FAF8F5] text-[#231712] cursor-pointer"
                      >
                        View Receipt
                      </button>
                      {sale.status === 'completed' && can('void_sale') && (
                        <button
                          type="button"
                          onClick={() => voidSale(sale.id)}
                          aria-label={`Void receipt ${sale.receiptNumber}`}
                          className="min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#D0311E]/40 text-[#BE1A1A] cursor-pointer"
                        >
                          Void
                        </button>
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
                      <th className="px-4 py-2.5 font-medium">Receipt</th>
                      <th className="px-4 py-2.5 font-medium">Date</th>
                      <th className="px-4 py-2.5 font-medium">Customer</th>
                      <th className="px-4 py-2.5 font-medium">Cashier</th>
                      <th className="px-4 py-2.5 font-medium">Method</th>
                      <th className="px-4 py-2.5 font-medium text-right">Total</th>
                      <th className="px-4 py-2.5 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8DFD3]">
                    {sales.slice(0, 8).map((sale) => (
                      <tr key={sale.id} className="hover:bg-[#FAF8F5]">
                        <td className="px-4 py-2.5 font-mono text-xs font-medium text-[#231712]">
                          {sale.receiptNumber}
                          {sale.status === 'voided' && (
                            <span className="ml-2 text-[#BE1A1A] font-sans">(Voided)</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-[#766257]">
                          {sale.saleDate}
                        </td>
                        <td className="px-4 py-2.5 text-[#231712]">{sale.customerName}</td>
                        <td className="px-4 py-2.5 text-xs text-[#5C493F]">{sale.cashierName}</td>
                        <td className="px-4 py-2.5 text-[#766257]">{sale.paymentMethod}</td>
                        <td className="px-4 py-2.5 font-mono tabular-nums text-right font-medium text-[#231712]">
                          {formatCurrency(sale.total)}
                        </td>
                        <td className="px-4 py-2.5 text-right space-x-3 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setCompletedReceipt(sale)}
                            className="text-xs font-medium text-[#231712] hover:text-[#BE1A1A] underline cursor-pointer"
                          >
                            Receipt
                          </button>
                          {sale.status === 'completed' && can('void_sale') && (
                            <button
                              type="button"
                              onClick={() => voidSale(sale.id)}
                              aria-label={`Void receipt ${sale.receiptNumber}`}
                              className="text-xs font-medium text-[#BE1A1A] hover:text-[#D0311E] cursor-pointer"
                            >
                              Void
                            </button>
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
      )}

      {/* Main Split: Catalog Left + Checkout Cart Right */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Catalog Pane */}
        <div className="xl:col-span-8 space-y-4">
          {/* Search & Barcode Bar */}
          <div className="bg-white border border-[#E8DFD3] rounded-xl p-3 sm:p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search
                  className="w-4 h-4 text-[#766257] absolute left-3.5 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <label htmlFor="pos-catalog-search" className="sr-only">
                  Search catalog or scan barcode
                </label>
                <input
                  id="pos-catalog-search"
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={handleBarcodeEnter}
                  placeholder="Search jewelry, perfume, SKU or barcode..."
                  className="w-full pl-10 pr-11 py-2.5 text-base sm:text-sm bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg focus:outline-none focus:border-[#BE1A1A] text-[#231712] placeholder:text-[#9A8579]"
                />
                <button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  aria-label="Scan barcode with camera"
                  title="Scan barcode with camera"
                  className="absolute right-1 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-md text-[#BE1A1A] hover:bg-[#FCE8E6] transition-colors cursor-pointer"
                >
                  <ScanLine className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                aria-label="Open camera barcode scanner"
                className="min-h-[44px] px-3 sm:px-3.5 py-2 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#231712] hover:bg-[#3A271F] text-[#F7D87F] text-xs font-semibold transition-colors cursor-pointer shrink-0 whitespace-nowrap"
              >
                <Camera className="w-4 h-4" aria-hidden="true" />
                <span>Scan</span>
              </button>
            </div>

            {/* Category Segmented Filter */}
            <div
              role="tablist"
              aria-label="Filter catalog by category"
              className="flex items-center gap-1.5 overflow-x-auto pb-0.5"
            >
              {(['All', ...PRODUCT_CATEGORIES] as const).map((cat) => {
                const active = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedCategory(cat)}
                    className={`min-h-[38px] px-3 sm:px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-[#231712] text-[#F7D87F]'
                        : 'bg-[#FAF8F5] text-[#5C493F] hover:bg-[#F8EBAB]/50 hover:text-[#231712]'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Empty Catalog State */}
          {inventory.length === 0 ? (
            <div className="bg-white border border-[#E8DFD3] rounded-xl p-8 sm:p-10 text-center">
              <p className="font-display text-lg font-semibold text-[#231712]">
                Your inventory catalog is empty
              </p>
              <p className="text-sm text-[#766257] mt-1 max-w-md mx-auto">
                Add items in the Inventory tab or load the starter ELA Jewelry boutique collection
                to start ringing up sales.
              </p>
              <button
                type="button"
                onClick={seedCloudCatalog}
                className="mt-5 min-h-[44px] px-5 py-2.5 bg-[#BE1A1A] hover:bg-[#D0311E] text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Load Starter ELA Catalog ({syncMode === 'cloud' ? 'Cloud' : 'Local'})
              </button>
            </div>
          ) : filteredInventory.length === 0 ? (
            <div className="bg-white border border-[#E8DFD3] rounded-xl p-8 text-center text-sm text-[#766257]">
              No products match "{search}". Try clearing your filter.
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-4">
              {filteredInventory.map((item) => {
                const inCart = cart.find((c) => c.itemId === item.id)?.quantity ?? 0;
                const isLow = item.quantity > 0 && item.quantity <= item.reorderLevel;
                const isOut = item.quantity <= 0;

                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={isOut}
                    onClick={() => addToCart(item)}
                    aria-label={`Add ${item.name} to cart`}
                    className={`group text-left bg-white border rounded-xl p-2.5 sm:p-4 flex flex-col justify-between transition-all cursor-pointer active:scale-[0.99] ${
                      inCart > 0
                        ? 'border-[#BE1A1A] bg-[#FFFDF8]'
                        : 'border-[#E8DFD3] hover:border-[#D0311E]/60 hover:-translate-y-0.5'
                    } ${isOut ? 'opacity-55 cursor-not-allowed' : ''}`}
                  >
                    <div>
                      <ProductCardImage src={item.imageUrl} alt={item.name} />
                      <div className="flex items-center justify-between gap-1.5 text-[11px] sm:text-xs">
                        <span className="font-medium text-[#BE1A1A] truncate">
                          {item.category}
                        </span>
                        <span className="hidden sm:inline font-mono text-[11px] text-[#766257] whitespace-nowrap shrink-0">
                          {item.sku}
                        </span>
                      </div>

                      <h3 className="text-xs sm:text-sm font-semibold text-[#231712] mt-1 sm:mt-2 leading-snug line-clamp-2">
                        {item.name}
                      </h3>

                      {item.notes && (
                        <p className="hidden sm:line-clamp-1 text-xs text-[#766257] mt-1">
                          {item.notes}
                        </p>
                      )}
                    </div>

                    <div className="mt-2.5 sm:mt-4 pt-2 sm:pt-3 border-t border-[#F0E9DF] flex items-end justify-between gap-1.5 sm:gap-2">
                      <div className="min-w-0">
                        <p className="font-mono tabular-nums text-sm sm:text-base font-semibold text-[#231712]">
                          {formatCurrency(item.retailPrice)}
                        </p>
                        <p
                          className={`text-[10px] sm:text-xs font-mono tabular-nums mt-0.5 truncate ${
                            isOut
                              ? 'text-[#BE1A1A] font-semibold'
                              : isLow
                              ? 'text-[#D0311E] font-medium'
                              : 'text-[#766257]'
                          }`}
                        >
                          {isOut ? 'Out' : `${item.quantity} left`}
                        </p>
                      </div>

                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold transition-colors shrink-0 ${
                          inCart > 0
                            ? 'bg-[#BE1A1A] text-white'
                            : 'bg-[#FAF8F5] text-[#231712] group-hover:bg-[#F8EBAB]'
                        }`}
                      >
                        <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5" aria-hidden="true" />
                        {inCart > 0 ? `${inCart}` : 'Add'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Checkout Cart Panel */}
        <form
          id="pos-checkout-panel"
          onSubmit={handleCompleteSale}
          className="xl:col-span-4 bg-white border border-[#E8DFD3] rounded-xl p-4 sm:p-5 space-y-4 sm:space-y-5 xl:sticky xl:top-6 scroll-mt-14"
        >
          <div className="flex items-center justify-between border-b border-[#E8DFD3] pb-3.5">
            <div>
              <h2 className="font-display text-lg font-semibold text-[#231712]">Current Sale</h2>
              <p className="text-xs text-[#766257]">
                {cartItemCount} item(s) selected
              </p>
            </div>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => setCart([])}
                className="min-h-[36px] px-2 text-xs font-medium text-[#BE1A1A] hover:underline cursor-pointer"
              >
                Clear Cart
              </button>
            )}
          </div>

          {/* Cart Line Items */}
          {cartLinesWithItems.length === 0 ? (
            <div className="py-8 text-center border border-dashed border-[#E8DFD3] rounded-lg">
              <p className="text-sm font-medium text-[#231712]">Cart is empty</p>
              <p className="text-xs text-[#766257] mt-1">
                Tap products to add or scan a barcode
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-[#F0E9DF] max-h-64 overflow-y-auto pr-1">
              {cartLinesWithItems.map(({ item, quantity }) => (
                <li key={item.id} className="py-3 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        referrerPolicy="no-referrer"
                        className="w-9 h-9 rounded-md object-cover border border-[#E8DFD3] bg-[#FAF8F5] shrink-0"
                      />
                    ) : (
                      <div
                        className="w-9 h-9 rounded-md border border-[#E8DFD3] bg-[#FAF8F5] flex items-center justify-center text-[#C8B9AE] shrink-0"
                        aria-hidden="true"
                      >
                        <Gem className="w-4 h-4" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#231712] truncate">{item.name}</p>
                      <p className="text-xs font-mono tabular-nums text-[#766257] mt-0.5">
                        {formatCurrency(item.retailPrice)} × {quantity} ={' '}
                        <span className="text-[#231712] font-medium">
                          {formatCurrency(item.retailPrice * quantity)}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => updateCartQty(item.id, -1)}
                      aria-label={`Decrease quantity of ${item.name}`}
                      className="min-w-[38px] min-h-[38px] sm:min-w-0 sm:min-h-0 sm:w-8 sm:h-8 flex items-center justify-center rounded-md border border-[#E8DFD3] hover:bg-[#FAF8F5] text-[#231712] cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-7 text-center font-mono tabular-nums text-xs font-semibold">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateCartQty(item.id, 1)}
                      aria-label={`Increase quantity of ${item.name}`}
                      className="min-w-[38px] min-h-[38px] sm:min-w-0 sm:min-h-0 sm:w-8 sm:h-8 flex items-center justify-center rounded-md border border-[#E8DFD3] hover:bg-[#FAF8F5] text-[#231712] cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.id)}
                      aria-label={`Remove ${item.name} from cart`}
                      className="min-w-[38px] min-h-[38px] sm:min-w-0 sm:min-h-0 sm:w-8 sm:h-8 flex items-center justify-center rounded-md text-[#766257] hover:text-[#BE1A1A] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Payment Method Selector */}
          <div className="space-y-2">
            <span className="block text-xs font-semibold text-[#231712]">Payment Method</span>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map((method) => {
                const Icon = PAYMENT_ICONS[method];
                const active = paymentMethod === method;
                return (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={`flex items-center gap-2 px-3 min-h-[42px] py-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'border-[#BE1A1A] bg-[#BE1A1A] text-white'
                        : 'border-[#E8DFD3] bg-[#FAF8F5] text-[#231712] hover:bg-[#F8EBAB]/40'
                    } ${method === 'Credit / Tab' ? 'col-span-2 justify-center' : ''}`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{method}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Customer Details (required for Credit / Tab, optional otherwise) */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="col-span-2 sm:col-span-1">
              <label htmlFor="pos-customer-name" className="block text-xs font-medium text-[#5C493F] mb-1">
                Customer {paymentMethod === 'Credit / Tab' ? '(Required)' : '(Optional)'}
              </label>
              <input
                id="pos-customer-name"
                type="text"
                required={paymentMethod === 'Credit / Tab'}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Walk-in Client"
                className="w-full px-3 py-2 text-base sm:text-xs bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg focus:outline-none focus:border-[#BE1A1A]"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label htmlFor="pos-customer-phone" className="block text-xs font-medium text-[#5C493F] mb-1">
                Phone Number
              </label>
              <input
                id="pos-customer-phone"
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+251-9..."
                className="w-full px-3 py-2 text-base sm:text-xs bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg focus:outline-none focus:border-[#BE1A1A]"
              />
            </div>

            {paymentMethod === 'Credit / Tab' && (
              <>
                <div>
                  <label htmlFor="pos-credit-deposit" className="block text-xs font-medium text-[#5C493F] mb-1">
                    Deposit Paid ($)
                  </label>
                  <input
                    id="pos-credit-deposit"
                    type="number"
                    min="0"
                    step="0.01"
                    value={initialDeposit}
                    onChange={(e) => setInitialDeposit(e.target.value)}
                    className="w-full px-3 py-2 text-base sm:text-xs font-mono tabular-nums bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg focus:outline-none focus:border-[#BE1A1A]"
                  />
                </div>
                <div>
                  <label htmlFor="pos-credit-due" className="block text-xs font-medium text-[#5C493F] mb-1">
                    Due Date
                  </label>
                  <input
                    id="pos-credit-due"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 text-base sm:text-xs font-mono bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg focus:outline-none focus:border-[#BE1A1A]"
                  />
                </div>
              </>
            )}
          </div>

          {/* Discount & Totals */}
          <div className="pt-3 border-t border-[#E8DFD3] space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="pos-discount" className="text-xs text-[#766257]">
                Discount ($)
              </label>
              <input
                id="pos-discount"
                type="number"
                min="0"
                step="0.01"
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
                className="w-24 px-2.5 py-1.5 text-right font-mono tabular-nums text-base sm:text-xs bg-[#FAF8F5] border border-[#E8DFD3] rounded-md focus:outline-none focus:border-[#BE1A1A]"
              />
            </div>
            <div className="flex items-center justify-between text-xs text-[#766257]">
              <span>Subtotal</span>
              <span className="font-mono tabular-nums">{formatCurrency(totals.subtotal)}</span>
            </div>
            {totals.discount > 0 && (
              <div className="flex items-center justify-between text-xs text-[#D0311E]">
                <span>Discount</span>
                <span className="font-mono tabular-nums">-{formatCurrency(totals.discount)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-base font-semibold text-[#231712] pt-2 border-t border-[#F0E9DF]">
              <span>Total Due</span>
              <span className="font-mono tabular-nums text-lg text-[#BE1A1A]">
                {formatCurrency(totals.total)}
              </span>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || totals.items.length === 0}
            className="w-full min-h-[48px] py-3 px-4 bg-[#BE1A1A] hover:bg-[#D0311E] disabled:bg-[#D5C9BE] disabled:cursor-not-allowed text-white font-semibold text-sm rounded-xl transition-colors cursor-pointer"
          >
            {submitting
              ? 'Recording Sale...'
              : paymentMethod === 'Credit / Tab'
              ? `Open Credit Tab (${formatCurrency(totals.total)})`
              : `Complete Sale (${formatCurrency(totals.total)})`}
          </button>
        </form>
      </div>

      {/* Mobile Floating Quick-Jump to Checkout */}
      {cartItemCount > 0 && (
        <button
          type="button"
          onClick={scrollToCheckout}
          className="xl:hidden fixed bottom-[calc(3.85rem+env(safe-area-inset-bottom,0px))] right-3.5 z-30 inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-[#231712] text-[#F7D87F] border border-[#F7D87F]/45 shadow-xl text-xs font-semibold cursor-pointer active:scale-[0.98] transition-transform no-print"
        >
          <ShoppingBag className="w-4 h-4" aria-hidden="true" />
          <span className="font-mono tabular-nums">
            {cartItemCount} · {formatCurrency(totals.total)}
          </span>
          <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      )}

      {/* Receipt Confirmation Modal */}
      {completedReceipt && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="receipt-dialog-title"
          className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="bg-white border border-[#E8DFD3] rounded-t-2xl sm:rounded-2xl max-w-md w-full p-5 sm:p-6 max-h-[92dvh] overflow-y-auto pb-safe print-only-sheet">
            <div className="flex items-center justify-between mb-4 no-print">
              <div className="flex items-center gap-2 text-[#231712]">
                <CheckCircle2 className="w-5 h-5 text-[#16A34A]" />
                <h2 id="receipt-dialog-title" className="font-display text-lg font-semibold">
                  Sale Recorded
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setCompletedReceipt(null)}
                aria-label="Close receipt modal"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-[#766257] hover:bg-[#FAF8F5] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="border border-[#E8DFD3] rounded-xl p-4 sm:p-5 bg-[#FAF8F5]/50 text-center space-y-3">
              <img
                src="./assets/aistudio/image_89dfb75c.png"
                alt="ELA Jewelry"
                className="h-14 sm:h-16 mx-auto object-contain"
                referrerPolicy="no-referrer"
              />
              <div className="text-xs text-[#766257]">
                <p className="font-semibold text-[#231712]">ELA Jewellery and Accessories</p>
                <p className="font-mono mt-0.5">
                  Receipt {completedReceipt.receiptNumber} · {completedReceipt.saleDate}
                </p>
                <p className="mt-0.5">
                  Client: {completedReceipt.customerName} · Paid via {completedReceipt.paymentMethod}
                </p>
              </div>

              <div className="border-t border-b border-dashed border-[#D8CBBF] py-3 text-left space-y-1.5 text-xs">
                {completedReceipt.items.map((line, idx) => (
                  <div key={`${line.itemId}-${idx}`} className="flex justify-between gap-2">
                    <span className="text-[#231712]">
                      {line.name} ×{line.quantity}
                    </span>
                    <span className="font-mono tabular-nums font-medium shrink-0">
                      {formatCurrency(line.lineTotal)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="text-xs space-y-1">
                {completedReceipt.discount > 0 && (
                  <div className="flex justify-between text-[#D0311E]">
                    <span>Discount</span>
                    <span className="font-mono tabular-nums">
                      -{formatCurrency(completedReceipt.discount)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold text-[#231712]">
                  <span>Total</span>
                  <span className="font-mono tabular-nums">
                    {formatCurrency(completedReceipt.total)}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-[#766257] pt-1">
                Served by {completedReceipt.cashierName} · Thank you for shopping with ELA
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
                onClick={() => setCompletedReceipt(null)}
                className="min-h-[44px] px-4 py-2 text-xs font-semibold rounded-lg bg-[#BE1A1A] hover:bg-[#D0311E] text-white cursor-pointer"
              >
                New Sale
              </button>
            </div>
          </div>
        </div>
      )}
      <BarcodeScannerModal
        open={scannerOpen}
        title="Scan Item Barcode"
        subtitle="Select a camera and align the barcode to add directly to the sale"
        allowContinuousMode
        onClose={() => setScannerOpen(false)}
        onScan={handleCameraBarcodeScan}
      />
    </div>
  );
};
