import React, { useMemo, useState } from 'react';
import { Printer, Plus, Minus } from 'lucide-react';
import { usePos } from '../context/PosContext';
import { InventoryItem } from '../types/pos';
import { encodeCode128B } from '../utils/barcode';
import { formatCurrency } from '../utils/posLogic';

type LabelTemplate = 'jewelry-tag' | 'perfume-box' | 'cosmetic-compact';
type LabelTheme = 'champagne-gold' | 'crimson-accent' | 'classic-ivory';

const BarcodeSvg: React.FC<{ value: string; height?: number }> = ({ value, height = 34 }) => {
  const encoded = useMemo(() => encodeCode128B(value), [value]);
  return (
    <svg
      role="img"
      aria-label={`Barcode ${encoded.normalizedText}`}
      viewBox={`0 0 ${encoded.totalModules} ${height}`}
      className="w-full h-9 block"
      preserveAspectRatio="none"
    >
      <rect x={0} y={0} width={encoded.totalModules} height={height} fill="#FFFFFF" />
      {encoded.bars.map((bar, i) => (
        <rect key={i} x={bar.x} y={0} width={bar.width} height={height} fill="#231712" />
      ))}
    </svg>
  );
};

export const LabelStudioView: React.FC = () => {
  const { inventory } = usePos();

  const [copiesById, setCopiesById] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    inventory.slice(0, 3).forEach((item) => {
      initial[item.id] = 2;
    });
    return initial;
  });

  const [template, setTemplate] = useState<LabelTemplate>('jewelry-tag');
  const [theme, setTheme] = useState<LabelTheme>('champagne-gold');
  const [showLogo, setShowLogo] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [showCategory, setShowCategory] = useState(true);
  const [showSku, setShowSku] = useState(true);
  const [search, setSearch] = useState('');

  const filteredInventory = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return inventory;
    return inventory.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.sku.toLowerCase().includes(q) ||
        i.barcode.toLowerCase().includes(q)
    );
  }, [inventory, search]);

  const setCopies = (itemId: string, next: number) => {
    setCopiesById((prev) => ({
      ...prev,
      [itemId]: Math.max(0, Math.min(30, next)),
    }));
  };

  const labelQueue = useMemo(() => {
    const list: Array<{ key: string; item: InventoryItem }> = [];
    for (const item of inventory) {
      const count = copiesById[item.id] ?? 0;
      for (let i = 0; i < count; i++) {
        list.push({ key: `${item.id}_${i}`, item });
      }
    }
    return list;
  }, [inventory, copiesById]);

  const themeClasses: Record<LabelTheme, { card: string; accent: string; price: string }> = {
    'champagne-gold': {
      card: 'bg-gradient-to-b from-white to-[#F8EBAB]/35 border-[#F7D87F]',
      accent: 'text-[#BE1A1A]',
      price: 'text-[#231712]',
    },
    'crimson-accent': {
      card: 'bg-white border-[#BE1A1A]',
      accent: 'text-[#BE1A1A]',
      price: 'text-[#BE1A1A]',
    },
    'classic-ivory': {
      card: 'bg-[#FAF8F5] border-[#231712]/25',
      accent: 'text-[#766257]',
      price: 'text-[#231712]',
    },
  };

  const gridClass =
    template === 'perfume-box'
      ? 'grid-cols-1 sm:grid-cols-2'
      : template === 'cosmetic-compact'
      ? 'grid-cols-2 sm:grid-cols-3'
      : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 no-print">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-semibold text-[#231712]">
            Item Label Studio
          </h1>
          <p className="text-xs sm:text-sm text-[#766257] mt-0.5">
            Design &amp; print boutique hang tags and Code 128 barcodes for ELA Jewelry inventory
          </p>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          disabled={labelQueue.length === 0}
          className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#BE1A1A] hover:bg-[#D0311E] disabled:bg-[#D5C9BE] text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
        >
          <Printer className="w-4 h-4" aria-hidden="true" />
          <span>Print {labelQueue.length} Label(s)</span>
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 sm:gap-6 items-start">
        {/* Left Studio Controls */}
        <div className="xl:col-span-5 space-y-4 no-print">
          {/* Format & Style Options */}
          <div className="bg-white border border-[#E8DFD3] rounded-xl p-4 sm:p-5 space-y-4">
            <h2 className="text-sm font-semibold text-[#231712]">Label Format &amp; Styling</h2>

            <div>
              <span className="block text-xs font-medium text-[#766257] mb-1.5">Tag Size</span>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'jewelry-tag', label: 'Jewelry Tag' },
                    { id: 'perfume-box', label: 'Perfume Box' },
                    { id: 'cosmetic-compact', label: 'Compact' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTemplate(t.id)}
                    className={`min-h-[42px] px-1.5 sm:px-2.5 py-2 text-[11px] sm:text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap truncate ${
                      template === t.id
                        ? 'bg-[#231712] text-[#F7D87F] border-[#231712]'
                        : 'bg-[#FAF8F5] text-[#5C493F] border-[#E8DFD3] hover:bg-[#F8EBAB]/40'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-xs font-medium text-[#766257] mb-1.5">
                Boutique Palette Theme
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'champagne-gold', label: 'Royal Gold' },
                    { id: 'crimson-accent', label: 'ELA Crimson' },
                    { id: 'classic-ivory', label: 'Classic Ivory' },
                  ] as const
                ).map((th) => (
                  <button
                    key={th.id}
                    type="button"
                    onClick={() => setTheme(th.id)}
                    className={`min-h-[42px] px-1.5 sm:px-2.5 py-2 text-[11px] sm:text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap truncate ${
                      theme === th.id
                        ? 'bg-[#BE1A1A] text-white border-[#BE1A1A]'
                        : 'bg-[#FAF8F5] text-[#5C493F] border-[#E8DFD3] hover:bg-[#F8EBAB]/40'
                    }`}
                  >
                    {th.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-[#E8DFD3] text-xs">
              <label className="flex items-center gap-2 cursor-pointer text-[#231712]">
                <input
                  type="checkbox"
                  checked={showLogo}
                  onChange={(e) => setShowLogo(e.target.checked)}
                  className="accent-[#BE1A1A]"
                />
                <span>ELA Jewelry Logo</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-[#231712]">
                <input
                  type="checkbox"
                  checked={showPrice}
                  onChange={(e) => setShowPrice(e.target.checked)}
                  className="accent-[#BE1A1A]"
                />
                <span>Retail Price</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-[#231712]">
                <input
                  type="checkbox"
                  checked={showCategory}
                  onChange={(e) => setShowCategory(e.target.checked)}
                  className="accent-[#BE1A1A]"
                />
                <span>Category Line</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-[#231712]">
                <input
                  type="checkbox"
                  checked={showSku}
                  onChange={(e) => setShowSku(e.target.checked)}
                  className="accent-[#BE1A1A]"
                />
                <span>SKU Code</span>
              </label>
            </div>
          </div>

          {/* Product Queue Selector */}
          <div className="bg-white border border-[#E8DFD3] rounded-xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#231712]">Select Items &amp; Copies</h2>
              <button
                type="button"
                onClick={() => setCopiesById({})}
                className="min-h-[36px] px-2 text-xs font-medium text-[#BE1A1A] hover:underline cursor-pointer"
              >
                Clear Queue
              </button>
            </div>

            <label htmlFor="label-search" className="sr-only">
              Filter items for labels
            </label>
            <input
              id="label-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter items by name or SKU..."
              className="w-full px-3 py-2.5 sm:py-2 text-base sm:text-xs bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg focus:outline-none focus:border-[#BE1A1A]"
            />

            <ul className="divide-y divide-[#F0E9DF] max-h-80 overflow-y-auto pr-1">
              {filteredInventory.map((item) => {
                const count = copiesById[item.id] ?? 0;
                return (
                  <li key={item.id} className="py-2.5 flex items-center justify-between gap-2.5">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#231712] truncate">{item.name}</p>
                      <p className="text-[11px] font-mono text-[#766257]">
                        {item.sku} · {formatCurrency(item.retailPrice)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setCopies(item.id, count - 1)}
                        aria-label={`Decrease label copies for ${item.name}`}
                        className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center rounded-md border border-[#E8DFD3] hover:bg-[#FAF8F5] cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-7 text-center font-mono tabular-nums text-xs font-semibold">
                        {count}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCopies(item.id, count + 1)}
                        aria-label={`Increase label copies for ${item.name}`}
                        className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center rounded-md border border-[#E8DFD3] hover:bg-[#FAF8F5] cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* Right Live Print Sheet Preview */}
        <div className="xl:col-span-7 bg-white border border-[#E8DFD3] rounded-xl p-4 sm:p-6 print-only-sheet">
          <div className="flex items-center justify-between pb-4 mb-5 border-b border-[#E8DFD3] no-print">
            <div>
              <h2 className="text-sm font-semibold text-[#231712]">Live Print Sheet Preview</h2>
              <p className="text-xs text-[#766257]">
                {labelQueue.length} barcode label(s) queued · Scannable Code 128B SVG
              </p>
            </div>
          </div>

          {labelQueue.length === 0 ? (
            <div className="py-12 sm:py-16 text-center text-sm text-[#766257] border border-dashed border-[#E8DFD3] rounded-xl px-4">
              Increase copy count on any product to preview printable boutique labels.
            </div>
          ) : (
            <div className={`grid ${gridClass} gap-3 sm:gap-4`}>
              {labelQueue.map(({ key, item }) => {
                const style = themeClasses[theme];
                return (
                  <div
                    key={key}
                    className={`print-label-card border-2 rounded-xl p-3.5 flex flex-col justify-between gap-2 ${style.card}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      {showLogo ? (
                        <img
                          src="./assets/aistudio/image_89dfb75c.png"
                          alt="ELA Jewelry"
                          className="h-8 w-auto object-contain"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="font-display text-xs font-bold text-[#231712]">
                          ELA JEWELRY
                        </span>
                      )}
                      {showPrice && (
                        <span
                          className={`font-mono tabular-nums text-sm font-bold ${style.price}`}
                        >
                          {formatCurrency(item.retailPrice)}
                        </span>
                      )}
                    </div>

                    <div>
                      {showCategory && (
                        <p className={`text-[10px] font-semibold tracking-wide ${style.accent}`}>
                          {item.category}
                        </p>
                      )}
                      <p className="text-xs font-semibold text-[#231712] leading-snug line-clamp-2">
                        {item.name}
                      </p>
                    </div>

                    <div className="bg-white rounded-md p-1.5 border border-[#E8DFD3]">
                      <BarcodeSvg value={item.barcode || item.sku} />
                      <div className="flex items-center justify-between text-[10px] font-mono text-[#5C493F] mt-1 px-0.5">
                        <span>{item.barcode}</span>
                        {showSku && <span>{item.sku}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
