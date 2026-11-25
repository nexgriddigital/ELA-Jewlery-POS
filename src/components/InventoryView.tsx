import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Pencil, Trash2, SlidersHorizontal, X, Image as ImageIcon, Upload } from 'lucide-react';
import { usePos } from '../context/PosContext';
import { InventoryItem, PRODUCT_CATEGORIES, ProductCategory } from '../types/pos';
import { calculateInventoryValuation, formatCurrency } from '../utils/posLogic';

interface ItemFormState {
  sku: string;
  barcode: string;
  name: string;
  category: ProductCategory;
  costPrice: string;
  retailPrice: string;
  quantity: string;
  reorderLevel: string;
  supplier: string;
  notes: string;
  imageUrl: string;
}

const EMPTY_FORM: ItemFormState = {
  sku: '',
  barcode: '',
  name: '',
  category: 'Jewelry',
  costPrice: '',
  retailPrice: '',
  quantity: '1',
  reorderLevel: '3',
  supplier: '',
  notes: '',
  imageUrl: '',
};

async function resizeImageToDataUrl(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read the selected image file.'));
      el.src = objectUrl;
    });
    const maxDim = 320;
    const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable.');
    ctx.fillStyle = '#FAF8F5';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    let dataUrl = canvas.toDataURL('image/jpeg', 0.78);
    if (dataUrl.length > 45000) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.52);
    }
    if (dataUrl.length > 48000) {
      throw new Error('Image is too large even after compression. Please choose a smaller photo or paste an image URL.');
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

const ItemThumbnail: React.FC<{ src?: string; alt: string; sizeClass?: string }> = ({
  src,
  alt,
  sizeClass = 'w-11 h-11',
}) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={`${sizeClass} rounded-lg border border-[#E8DFD3] bg-[#FAF8F5] flex items-center justify-center shrink-0 text-[#B8A699]`}
        aria-hidden="true"
      >
        <ImageIcon className="w-4 h-4" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
      className={`${sizeClass} rounded-lg border border-[#E8DFD3] bg-[#FAF8F5] object-cover shrink-0`}
    />
  );
};

export const InventoryView: React.FC = () => {
  const {
    inventory,
    can,
    addInventoryItem,
    updateInventoryItem,
    adjustInventoryQuantity,
    deleteInventoryItem,
    notify,
  } = usePos();

  const canEdit = can('inventory_edit');
  const canDelete = can('inventory_delete');

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'All' | ProductCategory>('All');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState<ItemFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState('');

  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
  const [adjustDelta, setAdjustDelta] = useState('1');

  const valuation = useMemo(() => calculateInventoryValuation(inventory), [inventory]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inventory.filter((item) => {
      if (categoryFilter !== 'All' && item.category !== categoryFilter) return false;
      if (stockFilter === 'low' && !(item.quantity > 0 && item.quantity <= item.reorderLevel))
        return false;
      if (stockFilter === 'out' && item.quantity > 0) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        item.barcode.toLowerCase().includes(q) ||
        item.supplier.toLowerCase().includes(q)
      );
    });
  }, [inventory, search, categoryFilter, stockFilter]);

  const openCreateModal = () => {
    setEditingItem(null);
    const nextCode = `ELA-${String(inventory.length + 101)}`;
    setForm({
      ...EMPTY_FORM,
      sku: nextCode,
      barcode: `89045${String(10000 + inventory.length + 1)}`,
    });
    setFormError('');
    setModalOpen(true);
  };

  const openEditModal = (item: InventoryItem) => {
    setEditingItem(item);
    setForm({
      sku: item.sku,
      barcode: item.barcode,
      name: item.name,
      category: item.category,
      costPrice: String(item.costPrice),
      retailPrice: String(item.retailPrice),
      quantity: String(item.quantity),
      reorderLevel: String(item.reorderLevel),
      supplier: item.supplier,
      notes: item.notes,
      imageUrl: item.imageUrl || '',
    });
    setFormError('');
    setModalOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setForm((prev) => ({ ...prev, imageUrl: dataUrl }));
      setFormError('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to process image.');
    }
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.sku.trim()) {
      setFormError('Product name and SKU are required.');
      return;
    }
    const cost = Number(form.costPrice);
    const retail = Number(form.retailPrice);
    const qty = Number(form.quantity);
    const reorder = Number(form.reorderLevel);

    if (!Number.isFinite(cost) || cost < 0 || !Number.isFinite(retail) || retail < 0) {
      setFormError('Cost price and retail price must be valid non-negative numbers.');
      return;
    }
    if (!Number.isFinite(qty) || qty < 0) {
      setFormError('Quantity must be 0 or greater.');
      return;
    }

    const payload = {
      sku: form.sku.trim(),
      barcode: form.barcode.trim() || form.sku.trim(),
      name: form.name.trim(),
      category: form.category,
      costPrice: cost,
      retailPrice: retail,
      quantity: Math.floor(qty),
      reorderLevel: Math.max(0, Math.floor(reorder || 0)),
      supplier: form.supplier.trim(),
      notes: form.notes.trim(),
      imageUrl: form.imageUrl.trim(),
    };

    try {
      if (editingItem) {
        await updateInventoryItem(editingItem.id, payload);
      } else {
        await addInventoryItem(payload);
      }
      setModalOpen(false);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to save inventory item.');
    }
  };

  const handleApplyAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustItem) return;
    const delta = parseInt(adjustDelta, 10);
    if (!Number.isFinite(delta) || delta === 0) {
      notify('error', 'Enter a non-zero quantity adjustment (e.g., +5 or -2).');
      return;
    }
    await adjustInventoryQuantity(adjustItem.id, delta);
    setAdjustItem(null);
    setAdjustDelta('1');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[#231712]">
            Inventory Management
          </h1>
          <p className="text-sm text-[#766257] mt-0.5">
            Real-time boutique stock ledger · Auto-adjusted by sales &amp; purchases
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#BE1A1A] hover:bg-[#D0311E] text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Add Inventory Item</span>
          </button>
        )}
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E8DFD3] rounded-xl p-4">
          <p className="text-xs text-[#766257]">Total SKUs / Units</p>
          <p className="font-mono tabular-nums text-xl font-semibold text-[#231712] mt-1">
            {valuation.totalSkus}{' '}
            <span className="text-sm font-normal text-[#766257]">
              / {valuation.totalUnits} pcs
            </span>
          </p>
        </div>
        <div className="bg-white border border-[#E8DFD3] rounded-xl p-4">
          <p className="text-xs text-[#766257]">Total Cost Value</p>
          <p className="font-mono tabular-nums text-xl font-semibold text-[#231712] mt-1">
            {formatCurrency(valuation.totalCostValue)}
          </p>
        </div>
        <div className="bg-white border border-[#E8DFD3] rounded-xl p-4">
          <p className="text-xs text-[#766257]">Total Retail Value</p>
          <p className="font-mono tabular-nums text-xl font-semibold text-[#BE1A1A] mt-1">
            {formatCurrency(valuation.totalRetailValue)}
          </p>
        </div>
        <div className="bg-white border border-[#E8DFD3] rounded-xl p-4">
          <p className="text-xs text-[#766257]">Low / Out of Stock</p>
          <p className="font-mono tabular-nums text-xl font-semibold text-[#D0311E] mt-1">
            {valuation.lowStockCount} low · {valuation.outOfStockCount} out
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#E8DFD3] rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search
            className="w-4 h-4 text-[#766257] absolute left-3 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
          <label htmlFor="inventory-search" className="sr-only">
            Search inventory
          </label>
          <input
            id="inventory-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by item name, SKU, barcode, or supplier..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg focus:outline-none focus:border-[#BE1A1A]"
          />
        </div>

        <label htmlFor="inventory-category-filter" className="sr-only">
          Category filter
        </label>
        <select
          id="inventory-category-filter"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as 'All' | ProductCategory)}
          className="px-3 py-2 text-sm bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg focus:outline-none focus:border-[#BE1A1A]"
        >
          <option value="All">All Categories</option>
          {PRODUCT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1 bg-[#FAF8F5] p-1 rounded-lg border border-[#E8DFD3]">
          {(
            [
              { id: 'all', label: 'All Stock' },
              { id: 'low', label: 'Low Stock' },
              { id: 'out', label: 'Out' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStockFilter(tab.id)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                stockFilter === tab.id
                  ? 'bg-[#231712] text-[#F7D87F]'
                  : 'text-[#5C493F] hover:text-[#231712]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-white border border-[#E8DFD3] rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#766257]">
            No inventory items match your filter. Click &ldquo;Add Inventory Item&rdquo; to record
            new stock.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-[#FAF8F5] text-xs text-[#766257] border-b border-[#E8DFD3]">
                <tr>
                  <th className="px-4 py-3 font-medium">SKU / Barcode</th>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium text-right">Cost</th>
                  <th className="px-4 py-3 font-medium text-right">Retail</th>
                  <th className="px-4 py-3 font-medium text-right">In Stock</th>
                  <th className="px-4 py-3 font-medium text-right">Retail Val.</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8DFD3]">
                {filtered.map((item) => {
                  const isLow = item.quantity > 0 && item.quantity <= item.reorderLevel;
                  const isOut = item.quantity <= 0;
                  return (
                    <tr key={item.id} className="hover:bg-[#FAF8F5]/80">
                      <td className="px-4 py-3 font-mono text-xs text-[#5C493F] whitespace-nowrap">
                        <div className="font-semibold text-[#231712]">{item.sku}</div>
                        <div className="text-[11px] text-[#766257]">{item.barcode}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <ItemThumbnail src={item.imageUrl} alt={item.name} />
                          <div className="min-w-0">
                            <div className="font-medium text-[#231712]">{item.name}</div>
                            <div className="text-xs text-[#766257]">
                              {item.supplier || 'Direct Atelier'}
                              {item.notes ? ` · ${item.notes}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#5C493F] whitespace-nowrap">
                        {item.category}
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-right text-[#5C493F]">
                        {formatCurrency(item.costPrice)}
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-right font-medium text-[#231712]">
                        {formatCurrency(item.retailPrice)}
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-right whitespace-nowrap">
                        <span
                          className={
                            isOut
                              ? 'text-[#BE1A1A] font-bold'
                              : isLow
                              ? 'text-[#D0311E] font-semibold'
                              : 'text-[#231712] font-semibold'
                          }
                        >
                          {item.quantity}
                        </span>
                        <span className="text-[11px] text-[#766257] ml-1">
                          {isOut ? '(Out)' : isLow ? '(Low)' : ''}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-right text-[#231712]">
                        {formatCurrency(item.retailPrice * item.quantity)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {canEdit || canDelete ? (
                          <div className="inline-flex items-center gap-1">
                            {canEdit && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAdjustItem(item);
                                    setAdjustDelta('1');
                                  }}
                                  aria-label={`Adjust stock for ${item.name}`}
                                  title="Adjust Stock"
                                  className="p-1.5 rounded-md text-[#5C493F] hover:bg-[#F8EBAB]/60 hover:text-[#231712] cursor-pointer"
                                >
                                  <SlidersHorizontal className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openEditModal(item)}
                                  aria-label={`Edit ${item.name}`}
                                  title="Edit Product"
                                  className="p-1.5 rounded-md text-[#5C493F] hover:bg-[#F8EBAB]/60 hover:text-[#231712] cursor-pointer"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => deleteInventoryItem(item.id)}
                                aria-label={`Delete ${item.name}`}
                                title="Delete Product"
                                className="p-1.5 rounded-md text-[#766257] hover:bg-[#FCE8E6] hover:text-[#BE1A1A] cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-[#766257]">View only</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Item Modal */}
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="item-modal-title"
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleSaveItem}
            className="bg-white border border-[#E8DFD3] rounded-2xl max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-[#E8DFD3] pb-3">
              <h2 id="item-modal-title" className="font-display text-xl font-semibold text-[#231712]">
                {editingItem ? 'Edit Inventory Item' : 'Record New Inventory Item'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close item form"
                className="p-1.5 rounded-lg text-[#766257] hover:bg-[#FAF8F5] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <p role="alert" className="text-xs font-medium text-[#BE1A1A] bg-[#FCE8E6] px-3 py-2 rounded-lg">
                {formError}
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="inv-name" className="block text-xs font-semibold text-[#231712] mb-1">
                  Product Name *
                </label>
                <input
                  id="inv-name"
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., 18K Gold Pendant Necklace"
                  className="w-full px-3 py-2 text-sm bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg focus:outline-none focus:border-[#BE1A1A]"
                />
              </div>

              <div>
                <label htmlFor="inv-sku" className="block text-xs font-semibold text-[#231712] mb-1">
                  SKU *
                </label>
                <input
                  id="inv-sku"
                  type="text"
                  required
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg focus:outline-none focus:border-[#BE1A1A]"
                />
              </div>

              <div>
                <label htmlFor="inv-barcode" className="block text-xs font-semibold text-[#231712] mb-1">
                  Barcode
                </label>
                <input
                  id="inv-barcode"
                  type="text"
                  value={form.barcode}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg focus:outline-none focus:border-[#BE1A1A]"
                />
              </div>

              <div>
                <label htmlFor="inv-category" className="block text-xs font-semibold text-[#231712] mb-1">
                  Category
                </label>
                <select
                  id="inv-category"
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value as ProductCategory })
                  }
                  className="w-full px-3 py-2 text-sm bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg focus:outline-none focus:border-[#BE1A1A]"
                >
                  {PRODUCT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="inv-supplier" className="block text-xs font-semibold text-[#231712] mb-1">
                  Supplier
                </label>
                <input
                  id="inv-supplier"
                  type="text"
                  value={form.supplier}
                  onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                  placeholder="e.g., Aurelia Fine Metals"
                  className="w-full px-3 py-2 text-sm bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg focus:outline-none focus:border-[#BE1A1A]"
                />
              </div>

              <div>
                <label htmlFor="inv-cost" className="block text-xs font-semibold text-[#231712] mb-1">
                  Cost Price ($) *
                </label>
                <input
                  id="inv-cost"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={form.costPrice}
                  onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg focus:outline-none focus:border-[#BE1A1A]"
                />
              </div>

              <div>
                <label htmlFor="inv-retail" className="block text-xs font-semibold text-[#231712] mb-1">
                  Retail Price ($) *
                </label>
                <input
                  id="inv-retail"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={form.retailPrice}
                  onChange={(e) => setForm({ ...form, retailPrice: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg focus:outline-none focus:border-[#BE1A1A]"
                />
              </div>

              <div>
                <label htmlFor="inv-qty" className="block text-xs font-semibold text-[#231712] mb-1">
                  Current Stock Quantity *
                </label>
                <input
                  id="inv-qty"
                  type="number"
                  min="0"
                  required
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg focus:outline-none focus:border-[#BE1A1A]"
                />
              </div>

              <div>
                <label htmlFor="inv-reorder" className="block text-xs font-semibold text-[#231712] mb-1">
                  Low-Stock Alert Threshold
                </label>
                <input
                  id="inv-reorder"
                  type="number"
                  min="0"
                  value={form.reorderLevel}
                  onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg focus:outline-none focus:border-[#BE1A1A]"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="inv-notes" className="block text-xs font-semibold text-[#231712] mb-1">
                  Notes / Specifications
                </label>
                <input
                  id="inv-notes"
                  type="text"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Material, carat, volume, or packaging details"
                  className="w-full px-3 py-2 text-sm bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg focus:outline-none focus:border-[#BE1A1A]"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="inv-image-url" className="block text-xs font-semibold text-[#231712] mb-1.5">
                  Product Image (Optional)
                </label>
                <div className="flex items-center gap-3 p-3 rounded-xl border border-[#E8DFD3] bg-[#FAF8F5]">
                  <ItemThumbnail
                    src={form.imageUrl}
                    alt={form.name || 'Product preview'}
                    sizeClass="w-16 h-16"
                  />
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E8DFD3] bg-white hover:bg-[#F8EBAB]/30 text-xs font-medium text-[#231712] cursor-pointer">
                        <Upload className="w-3.5 h-3.5 text-[#BE1A1A]" aria-hidden="true" />
                        <span>Upload Photo</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="sr-only"
                        />
                      </label>
                      {form.imageUrl && (
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, imageUrl: '' })}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#BE1A1A] hover:bg-[#FCE8E6] cursor-pointer"
                        >
                          Remove Image
                        </button>
                      )}
                    </div>
                    <input
                      id="inv-image-url"
                      type="text"
                      value={form.imageUrl}
                      onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                      placeholder="Paste image URL (https://...) or upload a photo above"
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#E8DFD3] rounded-lg focus:outline-none focus:border-[#BE1A1A]"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-[#E8DFD3] flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-[#5C493F] hover:bg-[#FAF8F5] rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-sm font-semibold bg-[#BE1A1A] hover:bg-[#D0311E] text-white rounded-lg cursor-pointer"
              >
                {editingItem ? 'Save Changes' : 'Add to Inventory'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Quick Stock Adjustment Modal */}
      {adjustItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="adjust-modal-title"
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleApplyAdjustment}
            className="bg-white border border-[#E8DFD3] rounded-2xl max-w-sm w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 id="adjust-modal-title" className="font-display text-lg font-semibold text-[#231712]">
                Adjust Stock Level
              </h2>
              <button
                type="button"
                onClick={() => setAdjustItem(null)}
                aria-label="Close stock adjustment modal"
                className="p-1.5 rounded-lg text-[#766257] hover:bg-[#FAF8F5] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-[#766257]">
              <p className="font-semibold text-sm text-[#231712]">{adjustItem.name}</p>
              <p className="mt-0.5 font-mono">
                SKU {adjustItem.sku} · Current stock: {adjustItem.quantity}
              </p>
            </div>

            <div>
              <label htmlFor="adjust-delta" className="block text-xs font-semibold text-[#231712] mb-1">
                Quantity Change (positive to add, negative to deduct)
              </label>
              <input
                id="adjust-delta"
                type="number"
                required
                value={adjustDelta}
                onChange={(e) => setAdjustDelta(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg focus:outline-none focus:border-[#BE1A1A]"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAdjustItem(null)}
                className="px-4 py-2 text-xs font-medium text-[#5C493F] hover:bg-[#FAF8F5] rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold bg-[#BE1A1A] hover:bg-[#D0311E] text-white rounded-lg cursor-pointer"
              >
                Apply Adjustment
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
