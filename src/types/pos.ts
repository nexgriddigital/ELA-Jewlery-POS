export const STORE_ID = 'ela_jewelry_main';
export const OWNER_ADMIN_EMAIL = 'amanuealhailu007@gmail.com';
export const BOOTSTRAPPED_ADMIN_EMAILS: readonly string[] = [
  'amanuealhailu007@gmail.com',
  'nexgriddigital@gmail.com',
];

export type ProductCategory =
  | 'Jewelry'
  | 'Perfumes'
  | 'Cosmetics'
  | 'Watches & Accessories'
  | 'Gift Sets';

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  'Jewelry',
  'Perfumes',
  'Cosmetics',
  'Watches & Accessories',
  'Gift Sets',
];

export type PaymentMethod =
  | 'Cash'
  | 'Card'
  | 'Bank Transfer'
  | 'Mobile Money'
  | 'Credit / Tab';

export const PAYMENT_METHODS: PaymentMethod[] = [
  'Cash',
  'Card',
  'Bank Transfer',
  'Mobile Money',
  'Credit / Tab',
];

export type PurchasePaymentMethod =
  | 'Cash'
  | 'Bank Transfer'
  | 'Card'
  | 'Mobile Money'
  | 'Supplier Credit';

export const PURCHASE_PAYMENT_METHODS: PurchasePaymentMethod[] = [
  'Cash',
  'Bank Transfer',
  'Card',
  'Mobile Money',
  'Supplier Credit',
];

export type StaffRole = 'Admin' | 'Manager' | 'Cashier';
export type StaffStatus = 'active' | 'password_reset_required' | 'revoked';
export type AccessStatus = 'checking' | 'authorized' | 'unauthorized';

export interface StoreAccessConfig {
  id: string;
  storeName: string;
  adminEmails: string[];
  managerEmails: string[];
  cashierEmails: string[];
  memberEmails: string[];
}

export interface InventoryItem {
  id: string;
  storeId?: string;
  sku: string;
  barcode: string;
  name: string;
  category: ProductCategory;
  costPrice: number;
  retailPrice: number;
  quantity: number;
  reorderLevel: number;
  supplier: string;
  notes: string;
  imageUrl?: string;
  ownerUid?: string;
  memberEmails?: string[];
  createdByUid?: string;
  createdByEmail?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SaleLineItem {
  itemId: string;
  sku: string;
  name: string;
  category: ProductCategory;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  lineTotal: number;
}

export interface SaleRecord {
  id: string;
  storeId?: string;
  receiptNumber: string;
  items: SaleLineItem[];
  subtotal: number;
  discount: number;
  total: number;
  totalCost: number;
  paymentMethod: PaymentMethod;
  status: 'completed' | 'voided';
  customerName: string;
  customerPhone: string;
  cashierName: string;
  saleDate: string;
  ownerUid?: string;
  memberEmails?: string[];
  createdByUid?: string;
  createdByEmail?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PurchaseLineItem {
  itemId: string;
  sku: string;
  name: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
}

export interface PurchaseRecord {
  id: string;
  storeId?: string;
  invoiceNumber: string;
  supplierName: string;
  items: PurchaseLineItem[];
  totalCost: number;
  paymentStatus: 'Paid' | 'Supplier Credit';
  paymentMethod: PurchasePaymentMethod;
  notes: string;
  purchaseDate: string;
  recordedBy: string;
  ownerUid?: string;
  memberEmails?: string[];
  createdByUid?: string;
  createdByEmail?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DebtPayment {
  id: string;
  amount: number;
  method: Exclude<PaymentMethod, 'Credit / Tab'>;
  paidAt: string;
  note: string;
  recordedBy: string;
}

export interface DebtRecord {
  id: string;
  storeId?: string;
  customerName: string;
  customerPhone: string;
  saleId: string;
  description: string;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  status: 'open' | 'settled';
  dueDate: string;
  issuedDate: string;
  payments: DebtPayment[];
  ownerUid?: string;
  memberEmails?: string[];
  createdByUid?: string;
  createdByEmail?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface StaffProfile {
  id: string;
  storeId?: string;
  name: string;
  role: StaffRole;
  status: StaffStatus;
  email: string;
  phone: string;
  pinCode: string;
  lastPasswordReset: string;
  ownerUid?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

export type ActiveView =
  | 'pos'
  | 'sales'
  | 'inventory'
  | 'purchases'
  | 'labels'
  | 'reports'
  | 'debts'
  | 'staff'
  | 'reset';

export type SyncMode = 'cloud' | 'local';

export interface PosStoreState {
  inventory: InventoryItem[];
  sales: SaleRecord[];
  purchases: PurchaseRecord[];
  debts: DebtRecord[];
  staff: StaffProfile[];
}
