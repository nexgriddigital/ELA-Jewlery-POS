import {
  BOOTSTRAPPED_ADMIN_EMAILS,
  DateRange,
  DebtPayment,
  DebtRecord,
  InventoryItem,
  PAYMENT_METHODS,
  PaymentMethod,
  PosStoreState,
  ProductCategory,
  PurchaseLineItem,
  PurchaseRecord,
  SaleLineItem,
  SaleRecord,
} from '../types/pos';

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatCurrency(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
}

export function sanitizeText(value: string, maxLen: number): string {
  return String(value ?? '')
    .trim()
    .slice(0, maxLen);
}

export function sanitizeImageUrl(value: string, maxLen = 50000): string {
  const trimmed = String(value ?? '').trim();
  if (!trimmed || trimmed.length > maxLen) return '';
  if (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('/') ||
    /^data:image\/(png|jpeg|jpg|webp|gif);base64,[a-zA-Z0-9+/=]+$/.test(trimmed)
  ) {
    return trimmed;
  }
  return '';
}

export function generateId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  const ts = Date.now().toString(36);
  return `${prefix}_${ts}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

export function getTodayDateString(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isDateInRange(dateStr: string, range: DateRange): boolean {
  if (!dateStr) return false;
  const dayOnly = dateStr.slice(0, 10);
  if (range.from && dayOnly < range.from) return false;
  if (range.to && dayOnly > range.to) return false;
  return true;
}

export interface CartCalculation {
  items: SaleLineItem[];
  subtotal: number;
  discount: number;
  total: number;
  totalCost: number;
}

export function computeCartTotals(
  cartLines: Array<{ item: InventoryItem; quantity: number }>,
  discountAmount: number
): CartCalculation {
  const items: SaleLineItem[] = cartLines
    .filter((line) => line.quantity > 0)
    .map((line) => ({
      itemId: line.item.id,
      sku: line.item.sku,
      name: line.item.name,
      category: line.item.category,
      quantity: line.quantity,
      unitPrice: roundMoney(line.item.retailPrice),
      unitCost: roundMoney(line.item.costPrice),
      lineTotal: roundMoney(line.item.retailPrice * line.quantity),
    }));

  const subtotal = roundMoney(items.reduce((sum, line) => sum + line.lineTotal, 0));
  const clampedDiscount = roundMoney(Math.max(0, Math.min(discountAmount || 0, subtotal)));
  const total = roundMoney(subtotal - clampedDiscount);
  const totalCost = roundMoney(
    items.reduce((sum, line) => sum + line.unitCost * line.quantity, 0)
  );

  return {
    items,
    subtotal,
    discount: clampedDiscount,
    total,
    totalCost,
  };
}

export function applySaleToInventory(
  inventory: InventoryItem[],
  saleItems: SaleLineItem[]
): { updatedInventory: InventoryItem[]; error?: string } {
  const qtyById = new Map<string, number>();
  for (const line of saleItems) {
    if (line.quantity <= 0) {
      return { updatedInventory: inventory, error: `Invalid quantity for ${line.name}.` };
    }
    qtyById.set(line.itemId, (qtyById.get(line.itemId) ?? 0) + line.quantity);
  }

  for (const [itemId, needed] of qtyById.entries()) {
    const found = inventory.find((it) => it.id === itemId);
    if (!found) {
      return { updatedInventory: inventory, error: `Item ${itemId} not found in inventory.` };
    }
    if (found.quantity < needed) {
      return {
        updatedInventory: inventory,
        error: `Insufficient stock for "${found.name}" (${found.quantity} left, requested ${needed}).`,
      };
    }
  }

  const updatedInventory = inventory.map((item) => {
    const deduct = qtyById.get(item.id);
    if (!deduct) return item;
    return {
      ...item,
      quantity: Math.max(0, item.quantity - deduct),
    };
  });

  return { updatedInventory };
}

export function applyPurchaseToInventory(
  inventory: InventoryItem[],
  purchaseItems: PurchaseLineItem[]
): { updatedInventory: InventoryItem[]; error?: string } {
  const addsById = new Map<string, { qty: number; unitCost: number }>();
  for (const line of purchaseItems) {
    if (line.quantity <= 0 || line.unitCost < 0) {
      return {
        updatedInventory: inventory,
        error: `Invalid quantity or cost for ${line.name}.`,
      };
    }
    const existing = addsById.get(line.itemId);
    if (existing) {
      addsById.set(line.itemId, {
        qty: existing.qty + line.quantity,
        unitCost: line.unitCost,
      });
    } else {
      addsById.set(line.itemId, { qty: line.quantity, unitCost: line.unitCost });
    }
  }

  const updatedInventory = inventory.map((item) => {
    const incoming = addsById.get(item.id);
    if (!incoming) return item;
    const prevValue = item.quantity * item.costPrice;
    const newValue = incoming.qty * incoming.unitCost;
    const nextQty = item.quantity + incoming.qty;
    const weightedCost = nextQty > 0 ? roundMoney((prevValue + newValue) / nextQty) : incoming.unitCost;
    return {
      ...item,
      quantity: nextQty,
      costPrice: weightedCost,
    };
  });

  return { updatedInventory };
}

export function applyDebtRepayment(
  debt: DebtRecord,
  amount: number,
  method: Exclude<PaymentMethod, 'Credit / Tab'>,
  note: string,
  recordedBy: string,
  paidAt: string
): { updatedDebt: DebtRecord; error?: string } {
  if (debt.status === 'settled' || debt.balance <= 0) {
    return { updatedDebt: debt, error: 'This credit tab is already fully settled.' };
  }
  const cleanAmount = roundMoney(amount);
  if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) {
    return { updatedDebt: debt, error: 'Repayment amount must be greater than 0.' };
  }
  if (cleanAmount > roundMoney(debt.balance + 0.001)) {
    return {
      updatedDebt: debt,
      error: `Repayment (${formatCurrency(cleanAmount)}) exceeds remaining balance (${formatCurrency(debt.balance)}).`,
    };
  }

  const payment: DebtPayment = {
    id: generateId('pay'),
    amount: cleanAmount,
    method,
    paidAt,
    note: sanitizeText(note, 140),
    recordedBy: sanitizeText(recordedBy || 'Staff', 80),
  };

  const nextPaid = roundMoney(debt.paidAmount + cleanAmount);
  const nextBalance = roundMoney(Math.max(0, debt.totalAmount - nextPaid));
  const nextStatus: 'open' | 'settled' = nextBalance <= 0.009 ? 'settled' : 'open';

  return {
    updatedDebt: {
      ...debt,
      paidAmount: nextPaid,
      balance: nextStatus === 'settled' ? 0 : nextBalance,
      status: nextStatus,
      payments: [...debt.payments, payment].slice(-50),
    },
  };
}

export interface PaymentMethodSummary {
  method: PaymentMethod;
  count: number;
  total: number;
  sharePercent: number;
}

export interface SalesReportResult {
  sales: SaleRecord[];
  transactionCount: number;
  unitsSold: number;
  grossRevenue: number;
  totalDiscounts: number;
  totalCostOfGoods: number;
  netProfit: number;
  profitMarginPercent: number;
  byPaymentMethod: PaymentMethodSummary[];
}

export function generateSalesReport(sales: SaleRecord[], range: DateRange): SalesReportResult {
  const filtered = sales.filter(
    (s) => s.status === 'completed' && isDateInRange(s.saleDate, range)
  );

  const grossRevenue = roundMoney(filtered.reduce((sum, s) => sum + s.total, 0));
  const totalDiscounts = roundMoney(filtered.reduce((sum, s) => sum + s.discount, 0));
  const totalCostOfGoods = roundMoney(filtered.reduce((sum, s) => sum + s.totalCost, 0));
  const netProfit = roundMoney(grossRevenue - totalCostOfGoods);
  const unitsSold = filtered.reduce(
    (sum, s) => sum + s.items.reduce((acc, item) => acc + item.quantity, 0),
    0
  );
  const profitMarginPercent =
    grossRevenue > 0 ? roundMoney((netProfit / grossRevenue) * 100) : 0;

  const byPaymentMethod: PaymentMethodSummary[] = PAYMENT_METHODS.map((method) => {
    const matches = filtered.filter((s) => s.paymentMethod === method);
    const total = roundMoney(matches.reduce((sum, s) => sum + s.total, 0));
    return {
      method,
      count: matches.length,
      total,
      sharePercent: grossRevenue > 0 ? roundMoney((total / grossRevenue) * 100) : 0,
    };
  });

  return {
    sales: filtered,
    transactionCount: filtered.length,
    unitsSold,
    grossRevenue,
    totalDiscounts,
    totalCostOfGoods,
    netProfit,
    profitMarginPercent,
    byPaymentMethod,
  };
}

export interface PurchaseReportResult {
  purchases: PurchaseRecord[];
  orderCount: number;
  unitsPurchased: number;
  totalSpend: number;
  paidSpend: number;
  supplierCreditSpend: number;
  bySupplier: Array<{ supplierName: string; orderCount: number; totalCost: number }>;
}

export function generatePurchaseReport(
  purchases: PurchaseRecord[],
  range: DateRange
): PurchaseReportResult {
  const filtered = purchases.filter((p) => isDateInRange(p.purchaseDate, range));
  const totalSpend = roundMoney(filtered.reduce((sum, p) => sum + p.totalCost, 0));
  const paidSpend = roundMoney(
    filtered
      .filter((p) => p.paymentStatus === 'Paid')
      .reduce((sum, p) => sum + p.totalCost, 0)
  );
  const supplierCreditSpend = roundMoney(
    filtered
      .filter((p) => p.paymentStatus === 'Supplier Credit')
      .reduce((sum, p) => sum + p.totalCost, 0)
  );
  const unitsPurchased = filtered.reduce(
    (sum, p) => sum + p.items.reduce((acc, item) => acc + item.quantity, 0),
    0
  );

  const supplierMap = new Map<string, { orderCount: number; totalCost: number }>();
  for (const p of filtered) {
    const prev = supplierMap.get(p.supplierName) ?? { orderCount: 0, totalCost: 0 };
    supplierMap.set(p.supplierName, {
      orderCount: prev.orderCount + 1,
      totalCost: roundMoney(prev.totalCost + p.totalCost),
    });
  }

  const bySupplier = Array.from(supplierMap.entries())
    .map(([supplierName, stats]) => ({ supplierName, ...stats }))
    .sort((a, b) => b.totalCost - a.totalCost);

  return {
    purchases: filtered,
    orderCount: filtered.length,
    unitsPurchased,
    totalSpend,
    paidSpend,
    supplierCreditSpend,
    bySupplier,
  };
}

export interface CategoryValuation {
  category: ProductCategory;
  skuCount: number;
  totalUnits: number;
  costValue: number;
  retailValue: number;
  potentialProfit: number;
}

export interface InventoryValuationResult {
  totalSkus: number;
  totalUnits: number;
  totalCostValue: number;
  totalRetailValue: number;
  potentialGrossProfit: number;
  averageMarginPercent: number;
  lowStockCount: number;
  outOfStockCount: number;
  byCategory: CategoryValuation[];
}

export function calculateInventoryValuation(
  inventory: InventoryItem[]
): InventoryValuationResult {
  const totalUnits = inventory.reduce((sum, item) => sum + item.quantity, 0);
  const totalCostValue = roundMoney(
    inventory.reduce((sum, item) => sum + item.costPrice * item.quantity, 0)
  );
  const totalRetailValue = roundMoney(
    inventory.reduce((sum, item) => sum + item.retailPrice * item.quantity, 0)
  );
  const potentialGrossProfit = roundMoney(totalRetailValue - totalCostValue);
  const averageMarginPercent =
    totalRetailValue > 0 ? roundMoney((potentialGrossProfit / totalRetailValue) * 100) : 0;
  const lowStockCount = inventory.filter(
    (item) => item.quantity > 0 && item.quantity <= item.reorderLevel
  ).length;
  const outOfStockCount = inventory.filter((item) => item.quantity <= 0).length;

  const catMap = new Map<ProductCategory, CategoryValuation>();
  for (const item of inventory) {
    const existing = catMap.get(item.category) ?? {
      category: item.category,
      skuCount: 0,
      totalUnits: 0,
      costValue: 0,
      retailValue: 0,
      potentialProfit: 0,
    };
    const itemCost = roundMoney(item.costPrice * item.quantity);
    const itemRetail = roundMoney(item.retailPrice * item.quantity);
    existing.skuCount += 1;
    existing.totalUnits += item.quantity;
    existing.costValue = roundMoney(existing.costValue + itemCost);
    existing.retailValue = roundMoney(existing.retailValue + itemRetail);
    existing.potentialProfit = roundMoney(existing.retailValue - existing.costValue);
    catMap.set(item.category, existing);
  }

  return {
    totalSkus: inventory.length,
    totalUnits,
    totalCostValue,
    totalRetailValue,
    potentialGrossProfit,
    averageMarginPercent,
    lowStockCount,
    outOfStockCount,
    byCategory: Array.from(catMap.values()).sort((a, b) => b.retailValue - a.retailValue),
  };
}

export interface DebtReportResult {
  debtsInRange: DebtRecord[];
  openTabsCount: number;
  settledTabsCount: number;
  totalOutstandingBalance: number;
  totalIssuedInRange: number;
  totalCollectedInRange: number;
}

export function generateDebtReport(debts: DebtRecord[], range: DateRange): DebtReportResult {
  const debtsInRange = debts.filter((d) => isDateInRange(d.issuedDate, range));
  const openTabs = debts.filter((d) => d.status === 'open');
  const settledTabs = debts.filter((d) => d.status === 'settled');

  const totalOutstandingBalance = roundMoney(
    openTabs.reduce((sum, d) => sum + d.balance, 0)
  );
  const totalIssuedInRange = roundMoney(
    debtsInRange.reduce((sum, d) => sum + d.totalAmount, 0)
  );

  let totalCollectedInRange = 0;
  for (const debt of debts) {
    for (const payment of debt.payments) {
      if (isDateInRange(payment.paidAt, range)) {
        totalCollectedInRange = roundMoney(totalCollectedInRange + payment.amount);
      }
    }
  }

  return {
    debtsInRange,
    openTabsCount: openTabs.length,
    settledTabsCount: settledTabs.length,
    totalOutstandingBalance,
    totalIssuedInRange,
    totalCollectedInRange,
  };
}

/**
 * 9.2 Yearly Reset:
 * Clears Sales history, Purchase history, and Settled debt tabs,
 * while strictly preserving Current Inventory and all Open Debt/Credit Tabs (and Staff).
 */
export function applyYearlyReset(state: PosStoreState): PosStoreState {
  return {
    inventory: state.inventory,
    sales: [],
    purchases: [],
    debts: state.debts.filter((debt) => debt.status === 'open' && debt.balance > 0),
    staff: state.staff,
  };
}

/**
 * 9.1 Reset Everything:
 * Clears Inventory, Sales, Purchases, Debt/Credit tabs (and optionally non-primary staff).
 */
export function applyFullReset(
  state: PosStoreState,
  preserveAdminStaffId?: string
): PosStoreState {
  return {
    inventory: [],
    sales: [],
    purchases: [],
    debts: [],
    staff: preserveAdminStaffId
      ? state.staff.filter((member) => member.id === preserveAdminStaffId)
      : [],
  };
}

export function toCsv(headers: string[], rows: Array<Array<string | number>>): string {
  const escape = (cell: string | number) => {
    const str = String(cell ?? '');
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  return [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
}

export function normalizeEmail(email: string): string {
  return String(email ?? '').trim().toLowerCase().slice(0, 120);
}

export interface StoreMembershipLists {
  adminEmails: string[];
  managerEmails: string[];
  cashierEmails: string[];
  memberEmails: string[];
}

export function buildStoreMembership(
  staff: Array<{ email: string; role: 'Admin' | 'Manager' | 'Cashier'; status: string }>,
  ownerAdminEmail: string
): StoreMembershipLists {
  const owner = normalizeEmail(ownerAdminEmail);
  const adminSet = new Set<string>(owner ? [owner] : []);
  const managerSet = new Set<string>();
  const cashierSet = new Set<string>();

  for (const member of staff) {
    if (member.status === 'revoked') continue;
    const email = normalizeEmail(member.email);
    if (!email || !email.includes('@')) continue;

    if (member.role === 'Admin') {
      adminSet.add(email);
      managerSet.delete(email);
      cashierSet.delete(email);
    } else if (member.role === 'Manager') {
      if (!adminSet.has(email)) {
        managerSet.add(email);
        cashierSet.delete(email);
      }
    } else {
      if (!adminSet.has(email) && !managerSet.has(email)) {
        cashierSet.add(email);
      }
    }
  }

  const adminEmails = Array.from(adminSet).slice(0, 10);
  const managerEmails = Array.from(managerSet).slice(0, 15);
  const cashierEmails = Array.from(cashierSet).slice(0, 25);
  const memberEmails = Array.from(
    new Set([...adminEmails, ...managerEmails, ...cashierEmails])
  ).slice(0, 30);

  return { adminEmails, managerEmails, cashierEmails, memberEmails };
}

export function isBootstrappedAdminEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  return Boolean(normalized && BOOTSTRAPPED_ADMIN_EMAILS.includes(normalized));
}

export function resolveUserRole(
  email: string,
  lists: StoreMembershipLists,
  ownerAdminEmail: string
): 'Admin' | 'Manager' | 'Cashier' | null {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  if (
    normalized === normalizeEmail(ownerAdminEmail) ||
    isBootstrappedAdminEmail(normalized) ||
    lists.adminEmails.includes(normalized)
  ) {
    return 'Admin';
  }
  if (lists.managerEmails.includes(normalized)) {
    return 'Manager';
  }
  if (lists.cashierEmails.includes(normalized)) {
    return 'Cashier';
  }
  return null;
}

export type RoleCapability =
  | 'pos'
  | 'inventory_edit'
  | 'inventory_delete'
  | 'purchases'
  | 'labels'
  | 'reports'
  | 'debts'
  | 'void_sale'
  | 'staff_admin'
  | 'system_reset';

export function canPerformRoleAction(
  role: 'Admin' | 'Manager' | 'Cashier' | null,
  capability: RoleCapability
): boolean {
  if (!role) return false;
  if (role === 'Admin') return true;
  if (role === 'Manager') {
    return (
      capability === 'pos' ||
      capability === 'inventory_edit' ||
      capability === 'purchases' ||
      capability === 'labels' ||
      capability === 'reports' ||
      capability === 'debts' ||
      capability === 'void_sale'
    );
  }
  // Cashier
  return (
    capability === 'pos' ||
    capability === 'labels' ||
    capability === 'reports' ||
    capability === 'debts'
  );
}

// ---------------------------------------------------------------------------
// Terminal Email + Password / 4-Digit Quick PIN Helpers
// ---------------------------------------------------------------------------

export function isFourDigitPin(secret: string): boolean {
  return /^\d{4}$/.test(secret.trim());
}

export function validateTerminalSecret(secret: string): {
  valid: boolean;
  mode: 'pin' | 'password' | null;
  error?: string;
} {
  const trimmed = secret.trim();
  if (!trimmed) {
    return {
      valid: false,
      mode: null,
      error: 'Enter your 4-digit Quick Terminal PIN or Account Password.',
    };
  }
  if (isFourDigitPin(trimmed)) {
    return { valid: true, mode: 'pin' };
  }
  if (trimmed.length >= 6 && trimmed.length <= 64) {
    return { valid: true, mode: 'password' };
  }
  return {
    valid: false,
    mode: null,
    error: 'Use a 4-digit PIN (e.g. 8800) or an account password of at least 6 characters.',
  };
}

/**
 * Firebase Email/Password requires >= 6 characters.
 * 4-digit Quick Terminal PINs are deterministically normalized across all terminals
 * while full passwords (>= 6 chars) are sent directly.
 */
export function toFirebaseAuthPassword(secret: string): string {
  const trimmed = secret.trim();
  if (isFourDigitPin(trimmed)) {
    return `ELAPin#${trimmed}`;
  }
  return trimmed;
}

function timingSafeEqualString(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length, 1);
  let diff = a.length ^ b.length;
  for (let i = 0; i < maxLen; i += 1) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

export function authenticateLocalStaff<
  T extends { id: string; email: string; pinCode: string; status: string }
>(
  staffList: T[],
  email: string,
  secret: string
): { ok: true; staff: T } | { ok: false; error: string } {
  const normalized = normalizeEmail(email);
  const trimmedSecret = secret.trim();
  if (!normalized || !trimmedSecret) {
    return { ok: false, error: 'Enter your staff email address and password or 4-digit PIN.' };
  }

  const candidate = staffList.find((member) => normalizeEmail(member.email) === normalized);
  if (!candidate || candidate.status === 'revoked') {
    return { ok: false, error: 'Invalid staff email or password / 4-digit PIN.' };
  }

  const stored = (candidate.pinCode || '').trim();
  if (!stored || !timingSafeEqualString(stored, trimmedSecret)) {
    return { ok: false, error: 'Invalid staff email or password / 4-digit PIN.' };
  }

  return { ok: true, staff: candidate };
}

