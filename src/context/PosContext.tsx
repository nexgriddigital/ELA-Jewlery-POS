import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  User,
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  WriteBatch,
} from 'firebase/firestore';
import {
  auth,
  checkCloudConnection,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  provisionStaffAuthAccount,
} from '../lib/firebase';
import {
  AccessStatus,
  DebtRecord,
  InventoryItem,
  OWNER_ADMIN_EMAIL,
  PaymentMethod,
  PosStoreState,
  ProductCategory,
  PurchaseLineItem,
  PurchasePaymentMethod,
  PurchaseRecord,
  SaleLineItem,
  SaleRecord,
  StaffProfile,
  StaffRole,
  STORE_ID,
  StoreAccessConfig,
  SyncMode,
} from '../types/pos';
import {
  applyDebtRepayment,
  applyFullReset,
  applyPurchaseToInventory,
  applySaleToInventory,
  applyYearlyReset,
  authenticateLocalStaff,
  buildStoreMembership,
  canPerformRoleAction,
  generateId,
  getTodayDateString,
  isBootstrappedAdminEmail,
  normalizeEmail,
  resolveUserRole,
  RoleCapability,
  roundMoney,
  sanitizeImageUrl,
  sanitizeText,
  toFirebaseAuthPassword,
  validateTerminalSecret,
} from '../utils/posLogic';
import { createSeedData, DEFAULT_SEED_IMAGES_BY_ID } from '../data/seedData';

const LOCAL_STORAGE_KEY = 'ela_jewelry_pos_store_v1';
const LOCAL_SESSION_STAFF_KEY = 'ela_jewelry_terminal_staff_id_v1';
const CHANNEL_NAME = 'ela_jewelry_pos_sync_channel';

export interface ToastNotice {
  id: string;
  kind: 'success' | 'error' | 'info';
  text: string;
}

interface NewItemInput {
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
}

interface RecordSaleInput {
  items: SaleLineItem[];
  subtotal: number;
  discount: number;
  total: number;
  totalCost: number;
  paymentMethod: PaymentMethod;
  customerName: string;
  customerPhone: string;
  dueDate?: string;
  initialCreditDeposit?: number;
}

interface RecordPurchaseInput {
  invoiceNumber: string;
  supplierName: string;
  items: PurchaseLineItem[];
  paymentStatus: 'Paid' | 'Supplier Credit';
  paymentMethod: PurchasePaymentMethod;
  notes: string;
  purchaseDate: string;
}

interface NewDebtInput {
  customerName: string;
  customerPhone: string;
  description: string;
  totalAmount: number;
  paidAmount: number;
  dueDate: string;
}

interface NewStaffInput {
  name: string;
  role: StaffRole;
  email: string;
  phone: string;
  pinCode: string;
}

interface PosContextValue {
  user: User | null;
  authReady: boolean;
  accessStatus: AccessStatus;
  currentUserRole: StaffRole;
  can: (capability: RoleCapability) => boolean;
  storeConfig: StoreAccessConfig | null;
  authorizedMemberCount: number;
  syncMode: SyncMode;
  enteredApp: boolean;
  loadingData: boolean;
  lastSyncedAt: string;
  inventory: InventoryItem[];
  sales: SaleRecord[];
  purchases: PurchaseRecord[];
  debts: DebtRecord[];
  staff: StaffProfile[];
  activeCashierName: string;
  activeLocalStaffId: string;
  switchLocalStaff: (staffId: string) => void;
  toast: ToastNotice | null;
  dismissToast: () => void;
  notify: (kind: ToastNotice['kind'], text: string) => void;
  signInToTerminal: (
    email: string,
    secret: string,
    keepSignedIn: boolean
  ) => Promise<{
    ok: boolean;
    mode?: 'cloud' | 'local';
    needsEmailPasswordConsoleSetup?: boolean;
    error?: string;
  }>;
  completeFirstTimeStoreSetup: (input: {
    ownerName: string;
    email: string;
    phone: string;
    secret: string;
    keepSignedIn: boolean;
  }) => Promise<{
    ok: boolean;
    mode?: 'cloud' | 'local';
    needsEmailPasswordConsoleSetup?: boolean;
    error?: string;
  }>;
  refreshCloudConnection: () => Promise<{ reachable: boolean; detail: string }>;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  recheckStoreAccess: () => Promise<void>;
  enterDemoWorkspace: () => void;
  seedCloudCatalog: () => Promise<void>;
  addInventoryItem: (input: NewItemInput) => Promise<InventoryItem>;
  updateInventoryItem: (id: string, input: Partial<NewItemInput>) => Promise<void>;
  adjustInventoryQuantity: (id: string, delta: number) => Promise<void>;
  deleteInventoryItem: (id: string) => Promise<void>;
  recordSale: (input: RecordSaleInput) => Promise<SaleRecord>;
  voidSale: (saleId: string) => Promise<void>;
  recordPurchase: (input: RecordPurchaseInput) => Promise<PurchaseRecord>;
  settleSupplierPurchase: (
    purchaseId: string,
    method: Exclude<PurchasePaymentMethod, 'Supplier Credit'>
  ) => Promise<void>;
  addDebtRecord: (input: NewDebtInput) => Promise<DebtRecord>;
  recordDebtPayment: (
    debtId: string,
    amount: number,
    method: Exclude<PaymentMethod, 'Credit / Tab'>,
    note: string
  ) => Promise<void>;
  createStaffMember: (input: NewStaffInput) => Promise<StaffProfile>;
  updateStaffMember: (
    staffId: string,
    updates: { name: string; phone: string; email: string; role: StaffRole }
  ) => Promise<void>;
  resetStaffPassword: (staffId: string, newPinCode: string) => Promise<void>;
  deleteStaffMember: (staffId: string) => Promise<void>;
  removeAllOtherUsers: () => Promise<number>;
  performYearlyReset: () => Promise<{
    clearedSales: number;
    clearedPurchases: number;
    clearedSettledDebts: number;
  }>;
  performFullReset: (includeStaff: boolean) => Promise<void>;
}

const PosContext = createContext<PosContextValue | null>(null);

function loadLocalStore(): PosStoreState {
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PosStoreState;
      if (parsed && Array.isArray(parsed.inventory)) {
        return {
          ...parsed,
          inventory: parsed.inventory.map((item) => ({
            ...item,
            imageUrl:
              typeof item.imageUrl === 'string'
                ? item.imageUrl
                : DEFAULT_SEED_IMAGES_BY_ID[item.id] || '',
          })),
        };
      }
    }
  } catch {
    // Fall back to deterministic seed
  }
  const seeded = createSeedData('demo-ela-owner');
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(seeded));
  } catch {
    // Ignore storage quota errors
  }
  return seeded;
}

function saveLocalStore(state: PosStoreState) {
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

async function commitChunked(ops: Array<(batch: WriteBatch) => void>) {
  const CHUNK_SIZE = 380;
  for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
    const batch = writeBatch(db);
    const slice = ops.slice(i, i + CHUNK_SIZE);
    for (const apply of slice) {
      apply(batch);
    }
    await batch.commit();
  }
}

export const PosProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const autostart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const rememberedStaffId =
    typeof window !== 'undefined'
      ? window.localStorage.getItem(LOCAL_SESSION_STAFF_KEY) || ''
      : '';

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [accessStatus, setAccessStatus] = useState<AccessStatus>('authorized');
  const [accessRecheckCounter, setAccessRecheckCounter] = useState(0);
  const [storeConfig, setStoreConfig] = useState<StoreAccessConfig | null>(null);
  const [enteredApp, setEnteredApp] = useState<boolean>(autostart || Boolean(rememberedStaffId));
  const [loadingData, setLoadingData] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string>(() =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );
  const [toast, setToast] = useState<ToastNotice | null>(null);

  const [store, setStore] = useState<PosStoreState>(() => loadLocalStore());
  const [activeLocalStaffId, setActiveLocalStaffId] = useState<string>(
    rememberedStaffId || 'staff_owner'
  );
  const channelRef = useRef<BroadcastChannel | null>(null);

  const syncMode: SyncMode = user ? 'cloud' : 'local';
  const signedInEmail = normalizeEmail(user?.email || '');

  const localActiveStaff = useMemo(() => {
    return store.staff.find((s) => s.id === activeLocalStaffId) || store.staff[0] || null;
  }, [activeLocalStaffId, store.staff]);

  const currentUserRole: StaffRole = useMemo(() => {
    if (!user) {
      return localActiveStaff?.role || 'Admin';
    }
    if (isBootstrappedAdminEmail(signedInEmail)) return 'Admin';
    if (storeConfig) {
      const resolved = resolveUserRole(signedInEmail, storeConfig, OWNER_ADMIN_EMAIL);
      if (resolved) return resolved;
    }
    return 'Cashier';
  }, [localActiveStaff?.role, signedInEmail, storeConfig, user]);

  const activeCashierName = useMemo(() => {
    if (!user) {
      return localActiveStaff?.name || 'Amanuel Hailu';
    }
    const matchingStaff = store.staff.find(
      (m) => normalizeEmail(m.email) === signedInEmail
    );
    return matchingStaff?.name || user.displayName || signedInEmail.split('@')[0] || 'Staff';
  }, [localActiveStaff?.name, signedInEmail, store.staff, user]);

  const authorizedMemberCount = useMemo(() => {
    if (user && storeConfig) {
      return storeConfig.memberEmails.length;
    }
    return store.staff.filter((s) => s.status !== 'revoked').length;
  }, [store.staff, storeConfig, user]);

  const currentMemberEmails = useMemo(() => {
    if (storeConfig && storeConfig.memberEmails.length > 0) {
      return storeConfig.memberEmails;
    }
    return buildStoreMembership(store.staff, OWNER_ADMIN_EMAIL).memberEmails;
  }, [store.staff, storeConfig]);

  const currentAdminEmails = useMemo(() => {
    if (storeConfig && storeConfig.adminEmails.length > 0) {
      return storeConfig.adminEmails;
    }
    return buildStoreMembership(store.staff, OWNER_ADMIN_EMAIL).adminEmails;
  }, [store.staff, storeConfig]);

  const can = useCallback(
    (capability: RoleCapability) => canPerformRoleAction(currentUserRole, capability),
    [currentUserRole]
  );

  const notify = useCallback((kind: ToastNotice['kind'], text: string) => {
    const id = generateId('toast');
    setToast({ id, kind, text });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Cross-tab instant local sync when in Local Workspace mode
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;
    channel.onmessage = (event) => {
      if (!user && event.data?.type === 'LOCAL_STATE_SYNC' && event.data.payload) {
        setStore(event.data.payload as PosStoreState);
        setLastSyncedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      }
    };
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [user]);

  const commitLocalStore = useCallback((updater: (prev: PosStoreState) => PosStoreState) => {
    setStore((prev) => {
      const next = updater(prev);
      saveLocalStore(next);
      channelRef.current?.postMessage({ type: 'LOCAL_STATE_SYNC', payload: next });
      setLastSyncedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      return next;
    });
  }, []);

  const switchLocalStaff = useCallback(
    (staffId: string) => {
      setActiveLocalStaffId(staffId);
      const found = store.staff.find((s) => s.id === staffId);
      if (found) {
        notify('info', `Switched operator to ${found.name} (${found.role}) on shared store DB.`);
      }
    },
    [notify, store.staff]
  );

  // Firebase Auth state listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
      if (firebaseUser) {
        setEnteredApp(true);
        setAccessStatus('checking');
      } else {
        setStoreConfig(null);
        setAccessStatus('authorized');
      }
    });
    return () => unsub();
  }, []);

  // Step 1: Verify / Bootstrap Shared Store Access Config (/store_config/ela_jewelry_main)
  useEffect(() => {
    if (!authReady || !user) return;
    let cancelled = false;
    let unsubConfig: (() => void) | null = null;

    const initSharedStore = async () => {
      setAccessStatus('checking');
      const configRef = doc(db, 'store_config', STORE_ID);

      try {
        const snap = await getDoc(configRef);
        if (cancelled) return;

        if (!snap.exists()) {
          if (isBootstrappedAdminEmail(signedInEmail)) {
            const initialAdmins = Array.from(new Set([OWNER_ADMIN_EMAIL, signedInEmail]));
            const initialConfig: StoreAccessConfig = {
              id: STORE_ID,
              storeName: 'ELA Jewelry',
              adminEmails: initialAdmins,
              managerEmails: [],
              cashierEmails: [],
              memberEmails: initialAdmins,
            };
            const batch = writeBatch(db);
            batch.set(configRef, {
              ...initialConfig,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            batch.set(doc(db, 'staff_members', 'staff_owner'), {
              id: 'staff_owner',
              storeId: STORE_ID,
              name: sanitizeText(
                user.displayName ||
                  (signedInEmail === OWNER_ADMIN_EMAIL ? 'Amanuel Hailu' : 'Store Owner'),
                100
              ),
              role: 'Admin',
              status: 'active',
              memberEmails: initialAdmins,
              createdByUid: user.uid,
              createdByEmail: signedInEmail,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            batch.set(doc(db, 'staff_private', 'staff_owner'), {
              staffId: 'staff_owner',
              storeId: STORE_ID,
              email: signedInEmail,
              phone: '',
              pinCode: '8800',
              lastPasswordReset: '',
              adminEmails: initialAdmins,
              createdByUid: user.uid,
              createdByEmail: signedInEmail,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            await batch.commit();
            if (!cancelled) {
              setStoreConfig(initialConfig);
              setAccessStatus('authorized');
            }
          } else {
            setStoreConfig(null);
            setAccessStatus('unauthorized');
            return;
          }
        }

        // Attach real-time listener to shared store_config so role/revocation changes take effect live
        unsubConfig = onSnapshot(
          configRef,
          (liveSnap) => {
            if (cancelled) return;
            if (!liveSnap.exists()) {
              setAccessStatus('unauthorized');
              return;
            }
            const data = liveSnap.data();
            const cfg: StoreAccessConfig = {
              id: liveSnap.id,
              storeName: data.storeName || 'ELA Jewelry',
              adminEmails: Array.isArray(data.adminEmails) ? data.adminEmails : [OWNER_ADMIN_EMAIL],
              managerEmails: Array.isArray(data.managerEmails) ? data.managerEmails : [],
              cashierEmails: Array.isArray(data.cashierEmails) ? data.cashierEmails : [],
              memberEmails: Array.isArray(data.memberEmails) ? data.memberEmails : [OWNER_ADMIN_EMAIL],
            };
            setStoreConfig(cfg);
            const role = resolveUserRole(signedInEmail, cfg, OWNER_ADMIN_EMAIL);
            setAccessStatus(role ? 'authorized' : 'unauthorized');
          },
          () => {
            if (!cancelled) {
              setStoreConfig(null);
              setAccessStatus('unauthorized');
            }
          }
        );
      } catch {
        // Permission denied means user is not yet listed in ELA Jewelry's store_config
        if (!cancelled) {
          setStoreConfig(null);
          setAccessStatus('unauthorized');
        }
      }
    };

    void initSharedStore();
    return () => {
      cancelled = true;
      if (unsubConfig) unsubConfig();
    };
  }, [authReady, user, signedInEmail, accessRecheckCounter]);

  // Step 2: Shared Store Real-Time Collection Listeners (Multiple Users = One Database)
  useEffect(() => {
    if (!authReady || !user) {
      if (authReady && !user) {
        setStore(loadLocalStore());
      }
      return;
    }

    if (accessStatus !== 'authorized' || !storeConfig) {
      return;
    }

    setLoadingData(true);
    const isOwner = isBootstrappedAdminEmail(signedInEmail);
    const isAdmin = currentUserRole === 'Admin';

    // Single-field queries guarantee ZERO composite index errors
    const makeSharedQuery = (colName: string) =>
      isOwner
        ? query(collection(db, colName), where('storeId', '==', STORE_ID))
        : query(collection(db, colName), where('memberEmails', 'array-contains', signedInEmail));

    let staffPublicDocs: Array<{
      id: string;
      name: string;
      role: StaffRole;
      status: StaffProfile['status'];
    }> = [];
    let staffPrivateMap = new Map<
      string,
      { email: string; phone: string; pinCode: string; lastPasswordReset: string }
    >();

    const mergeStaff = () => {
      const merged: StaffProfile[] = staffPublicDocs.map((pub) => {
        const priv = staffPrivateMap.get(pub.id);
        return {
          id: pub.id,
          storeId: STORE_ID,
          name: pub.name,
          role: pub.role,
          status: pub.status,
          email: priv?.email ?? '',
          phone: priv?.phone ?? '',
          pinCode: priv?.pinCode ?? '••••',
          lastPasswordReset: priv?.lastPasswordReset ?? '',
        };
      });
      setStore((prev) => ({ ...prev, staff: merged }));
      setLastSyncedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };

    const unsubInv = onSnapshot(
      makeSharedQuery('inventory'),
      (snap) => {
        const items = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            storeId: data.storeId,
            sku: data.sku,
            barcode: data.barcode,
            name: data.name,
            category: data.category,
            costPrice: Number(data.costPrice) || 0,
            retailPrice: Number(data.retailPrice) || 0,
            quantity: Number(data.quantity) || 0,
            reorderLevel: Number(data.reorderLevel) || 0,
            supplier: data.supplier || '',
            notes: data.notes || '',
            imageUrl:
              typeof data.imageUrl === 'string'
                ? data.imageUrl
                : DEFAULT_SEED_IMAGES_BY_ID[d.id] || '',
          } as InventoryItem;
        });
        setStore((prev) => ({ ...prev, inventory: items }));
        setLoadingData(false);
        setLastSyncedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'inventory')
    );

    const unsubSales = onSnapshot(
      makeSharedQuery('sales'),
      (snap) => {
        const items = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              storeId: data.storeId,
              receiptNumber: data.receiptNumber,
              items: data.items || [],
              subtotal: Number(data.subtotal) || 0,
              discount: Number(data.discount) || 0,
              total: Number(data.total) || 0,
              totalCost: Number(data.totalCost) || 0,
              paymentMethod: data.paymentMethod,
              status: data.status,
              customerName: data.customerName || '',
              customerPhone: data.customerPhone || '',
              cashierName: data.cashierName || '',
              saleDate: data.saleDate || '',
              createdByEmail: data.createdByEmail || '',
            } as SaleRecord;
          })
          .sort((a, b) => (b.saleDate > a.saleDate ? 1 : -1));
        setStore((prev) => ({ ...prev, sales: items }));
        setLastSyncedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'sales')
    );

    const unsubPurchases = onSnapshot(
      makeSharedQuery('purchases'),
      (snap) => {
        const items = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              storeId: data.storeId,
              invoiceNumber: data.invoiceNumber,
              supplierName: data.supplierName,
              items: data.items || [],
              totalCost: Number(data.totalCost) || 0,
              paymentStatus: data.paymentStatus,
              paymentMethod: data.paymentMethod,
              notes: data.notes || '',
              purchaseDate: data.purchaseDate || '',
              recordedBy: data.recordedBy || '',
            } as PurchaseRecord;
          })
          .sort((a, b) => (b.purchaseDate > a.purchaseDate ? 1 : -1));
        setStore((prev) => ({ ...prev, purchases: items }));
        setLastSyncedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'purchases')
    );

    const unsubDebts = onSnapshot(
      makeSharedQuery('debts'),
      (snap) => {
        const items = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              storeId: data.storeId,
              customerName: data.customerName,
              customerPhone: data.customerPhone || '',
              saleId: data.saleId || '',
              description: data.description || '',
              totalAmount: Number(data.totalAmount) || 0,
              paidAmount: Number(data.paidAmount) || 0,
              balance: Number(data.balance) || 0,
              status: data.status,
              dueDate: data.dueDate || '',
              issuedDate: data.issuedDate || '',
              payments: data.payments || [],
            } as DebtRecord;
          })
          .sort((a, b) =>
            a.status === b.status ? (b.issuedDate > a.issuedDate ? 1 : -1) : a.status === 'open' ? -1 : 1
          );
        setStore((prev) => ({ ...prev, debts: items }));
        setLastSyncedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'debts')
    );

    const unsubStaffPub = onSnapshot(
      makeSharedQuery('staff_members'),
      (snap) => {
        staffPublicDocs = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name,
            role: data.role,
            status: data.status,
          };
        });
        mergeStaff();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'staff_members')
    );

    let unsubStaffPriv: (() => void) | null = null;
    if (isAdmin) {
      const qStaffPriv = isOwner
        ? query(collection(db, 'staff_private'), where('storeId', '==', STORE_ID))
        : query(
            collection(db, 'staff_private'),
            where('adminEmails', 'array-contains', signedInEmail)
          );
      unsubStaffPriv = onSnapshot(
        qStaffPriv,
        (snap) => {
          staffPrivateMap = new Map();
          snap.docs.forEach((d) => {
            const data = d.data();
            staffPrivateMap.set(d.id, {
              email: data.email || '',
              phone: data.phone || '',
              pinCode: data.pinCode || '••••',
              lastPasswordReset: data.lastPasswordReset || '',
            });
          });
          mergeStaff();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'staff_private')
      );
    }

    return () => {
      unsubInv();
      unsubSales();
      unsubPurchases();
      unsubDebts();
      unsubStaffPub();
      if (unsubStaffPriv) unsubStaffPriv();
    };
  }, [authReady, user, accessStatus, storeConfig?.id, signedInEmail, currentUserRole]);

  // Propagates updated memberEmails & adminEmails across all shared store documents
  const propagateMembershipCloud = useCallback(
    async (
      nextStaffList: StaffProfile[],
      extraOps: Array<(batch: WriteBatch) => void> = [],
      skipStaffIds: Set<string> = new Set()
    ) => {
      const membership = buildStoreMembership(nextStaffList, OWNER_ADMIN_EMAIL);
      const ops: Array<(batch: WriteBatch) => void> = [
        (batch) =>
          batch.update(doc(db, 'store_config', STORE_ID), {
            storeName: 'ELA Jewelry',
            adminEmails: membership.adminEmails,
            managerEmails: membership.managerEmails,
            cashierEmails: membership.cashierEmails,
            memberEmails: membership.memberEmails,
            updatedAt: serverTimestamp(),
          }),
        ...extraOps,
      ];

      for (const item of store.inventory) {
        ops.push((batch) =>
          batch.update(doc(db, 'inventory', item.id), {
            memberEmails: membership.memberEmails,
            updatedAt: serverTimestamp(),
          })
        );
      }
      for (const sale of store.sales) {
        ops.push((batch) =>
          batch.update(doc(db, 'sales', sale.id), {
            memberEmails: membership.memberEmails,
            updatedAt: serverTimestamp(),
          })
        );
      }
      for (const po of store.purchases) {
        ops.push((batch) =>
          batch.update(doc(db, 'purchases', po.id), {
            memberEmails: membership.memberEmails,
            updatedAt: serverTimestamp(),
          })
        );
      }
      for (const debt of store.debts) {
        ops.push((batch) =>
          batch.update(doc(db, 'debts', debt.id), {
            memberEmails: membership.memberEmails,
            updatedAt: serverTimestamp(),
          })
        );
      }
      for (const member of store.staff) {
        if (skipStaffIds.has(member.id)) continue;
        ops.push((batch) =>
          batch.update(doc(db, 'staff_members', member.id), {
            memberEmails: membership.memberEmails,
            updatedAt: serverTimestamp(),
          })
        );
        ops.push((batch) =>
          batch.update(doc(db, 'staff_private', member.id), {
            adminEmails: membership.adminEmails,
            updatedAt: serverTimestamp(),
          })
        );
      }

      await commitChunked(ops);
    },
    [store.debts, store.inventory, store.purchases, store.sales, store.staff]
  );

  const signInToTerminal = useCallback(
    async (
      email: string,
      secret: string,
      keepSignedIn: boolean
    ): Promise<{
      ok: boolean;
      mode?: 'cloud' | 'local';
      needsEmailPasswordConsoleSetup?: boolean;
      error?: string;
    }> => {
      const normalized = normalizeEmail(email);
      if (!normalized || !normalized.includes('@')) {
        return { ok: false, error: 'Please enter a valid staff email address.' };
      }

      const secretCheck = validateTerminalSecret(secret);
      if (!secretCheck.valid) {
        return { ok: false, error: secretCheck.error };
      }

      const authPassword = toFirebaseAuthPassword(secret);

      try {
        await setPersistence(
          auth,
          keepSignedIn ? browserLocalPersistence : browserSessionPersistence
        );
        await signInWithEmailAndPassword(auth, normalized, authPassword);
        setEnteredApp(true);
        notify('success', 'Signed in — connected to shared ELA Jewelry cloud database.');
        return { ok: true, mode: 'cloud' };
      } catch (err) {
        const code =
          typeof err === 'object' && err !== null && 'code' in err
            ? String((err as { code?: unknown }).code)
            : '';

        const providerDisabled =
          code === 'auth/operation-not-allowed' ||
          code === 'auth/admin-restricted-operation' ||
          code === 'auth/network-request-failed';

        const localMatch = authenticateLocalStaff(store.staff, normalized, secret);

        // If Email/Password is enabled in Firebase Console but this bootstrapped admin
        // hasn't registered on the new Firebase project yet, provision & connect to cloud directly.
        if (
          localMatch.ok &&
          isBootstrappedAdminEmail(normalized) &&
          (code === 'auth/user-not-found' || code === 'auth/invalid-credential')
        ) {
          try {
            const cred = await createUserWithEmailAndPassword(auth, normalized, authPassword);
            await updateProfile(cred.user, { displayName: localMatch.staff.name });
            setEnteredApp(true);
            notify('success', 'Signed in — connected to shared ELA Jewelry cloud database.');
            return { ok: true, mode: 'cloud' };
          } catch (provErr) {
            const provCode =
              typeof provErr === 'object' && provErr !== null && 'code' in provErr
                ? String((provErr as { code?: unknown }).code)
                : '';
            if (provCode === 'auth/email-already-in-use') {
              return {
                ok: false,
                error: 'Incorrect password or 4-digit PIN for this cloud account.',
              };
            }
          }
        }

        if (localMatch.ok) {
          setActiveLocalStaffId(localMatch.staff.id);
          try {
            if (keepSignedIn) {
              window.localStorage.setItem(LOCAL_SESSION_STAFF_KEY, localMatch.staff.id);
            } else {
              window.localStorage.removeItem(LOCAL_SESSION_STAFF_KEY);
            }
          } catch {
            // Ignore storage errors
          }
          setEnteredApp(true);
          notify(
            providerDisabled ? 'info' : 'success',
            providerDisabled
              ? `Signed in locally as ${localMatch.staff.name}. Enable Email/Password in Firebase Console to sync without Google Sign-In.`
              : `Signed in as ${localMatch.staff.name} (${localMatch.staff.role}) on ELA Jewelry Terminal.`
          );
          return {
            ok: true,
            mode: 'local',
            needsEmailPasswordConsoleSetup: providerDisabled,
          };
        }

        if (providerDisabled) {
          return {
            ok: false,
            needsEmailPasswordConsoleSetup: true,
            error:
              'Invalid staff email or 4-digit PIN/password. (To enable Cloud Email/Password login, turn on Email/Password in Firebase Console or use Google Sign-In below.)',
          };
        }

        return {
          ok: false,
          error: 'Invalid staff email or password / 4-digit PIN.',
        };
      }
    },
    [notify, store.staff]
  );

  const completeFirstTimeStoreSetup = useCallback(
    async (input: {
      ownerName: string;
      email: string;
      phone: string;
      secret: string;
      keepSignedIn: boolean;
    }): Promise<{
      ok: boolean;
      mode?: 'cloud' | 'local';
      needsEmailPasswordConsoleSetup?: boolean;
      error?: string;
    }> => {
      const cleanName = sanitizeText(input.ownerName, 100);
      const normalized = normalizeEmail(input.email);
      const cleanPhone = sanitizeText(input.phone, 40);

      if (!cleanName) {
        return { ok: false, error: 'Enter the store owner full name.' };
      }
      if (!normalized || !normalized.includes('@')) {
        return { ok: false, error: 'Enter a valid owner email address.' };
      }
      const secretCheck = validateTerminalSecret(input.secret);
      if (!secretCheck.valid) {
        return { ok: false, error: secretCheck.error };
      }

      const authPassword = toFirebaseAuthPassword(input.secret);

      try {
        await setPersistence(
          auth,
          input.keepSignedIn ? browserLocalPersistence : browserSessionPersistence
        );
        const cred = await createUserWithEmailAndPassword(auth, normalized, authPassword);
        await updateProfile(cred.user, { displayName: cleanName });
        setEnteredApp(true);
        notify('success', `Store terminal initialized for ${cleanName}.`);
        return { ok: true, mode: 'cloud' };
      } catch (err) {
        const code =
          typeof err === 'object' && err !== null && 'code' in err
            ? String((err as { code?: unknown }).code)
            : '';

        if (code === 'auth/email-already-in-use') {
          return {
            ok: false,
            error: 'An account with this email already exists. Return to Terminal Sign In.',
          };
        }

        const providerDisabled =
          code === 'auth/operation-not-allowed' ||
          code === 'auth/admin-restricted-operation' ||
          code === 'auth/network-request-failed';

        if (providerDisabled) {
          // Configure primary owner profile in local shared terminal store so the user can operate immediately
          const cleanPin = sanitizeText(input.secret, 20);
          commitLocalStore((prev) => {
            const existingIdx = prev.staff.findIndex(
              (m) => m.id === 'staff_owner' || normalizeEmail(m.email) === normalized
            );
            const ownerProfile: StaffProfile = {
              id: existingIdx >= 0 ? prev.staff[existingIdx].id : 'staff_owner',
              storeId: STORE_ID,
              name: cleanName,
              role: 'Admin',
              status: 'active',
              email: normalized,
              phone: cleanPhone,
              pinCode: cleanPin,
              lastPasswordReset: '',
            };
            const nextStaff =
              existingIdx >= 0
                ? prev.staff.map((m, idx) => (idx === existingIdx ? ownerProfile : m))
                : [ownerProfile, ...prev.staff];
            return { ...prev, staff: nextStaff };
          });
          setActiveLocalStaffId('staff_owner');
          try {
            if (input.keepSignedIn) {
              window.localStorage.setItem(LOCAL_SESSION_STAFF_KEY, 'staff_owner');
            } else {
              window.localStorage.removeItem(LOCAL_SESSION_STAFF_KEY);
            }
          } catch {
            // Ignore storage errors
          }
          setEnteredApp(true);
          notify('success', `ELA Jewelry terminal set up for ${cleanName} (Admin).`);
          return { ok: true, mode: 'local', needsEmailPasswordConsoleSetup: true };
        }

        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Unable to complete store setup.',
        };
      }
    },
    [commitLocalStore, notify]
  );

  const refreshCloudConnection = useCallback(async () => {
    const result = await checkCloudConnection();
    setLastSyncedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    if (user) {
      setAccessRecheckCounter((c) => c + 1);
    }
    notify(result.reachable ? 'success' : 'info', result.detail);
    return result;
  }, [notify, user]);

  const signInWithGoogle = useCallback(async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      notify('success', 'Signed in — connected to shared ELA Jewelry database.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to complete Google sign-in.';
      notify('error', msg);
    }
  }, [notify]);

  const signOutUser = useCallback(async () => {
    try {
      if (user) {
        await firebaseSignOut(auth);
      }
      try {
        window.localStorage.removeItem(LOCAL_SESSION_STAFF_KEY);
      } catch {
        // Ignore storage errors
      }
      setStore(loadLocalStore());
      setEnteredApp(false);
      notify('info', 'Signed out of terminal.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Sign-out failed.');
    }
  }, [notify, user]);

  const recheckStoreAccess = useCallback(async () => {
    setAccessRecheckCounter((c) => c + 1);
  }, []);

  const enterDemoWorkspace = useCallback(() => {
    setEnteredApp(true);
  }, []);

  const seedCloudCatalog = useCallback(async () => {
    const seed = createSeedData(user?.uid || 'demo-ela-owner');
    if (!user) {
      commitLocalStore(() => seed);
      notify('success', 'ELA Jewelry boutique catalog restored.');
      return;
    }

    try {
      const ops: Array<(batch: WriteBatch) => void> = [];
      for (const item of seed.inventory) {
        ops.push((batch) =>
          batch.set(doc(db, 'inventory', item.id), {
            id: item.id,
            storeId: STORE_ID,
            sku: item.sku,
            barcode: item.barcode,
            name: item.name,
            category: item.category,
            costPrice: item.costPrice,
            retailPrice: item.retailPrice,
            quantity: item.quantity,
            reorderLevel: item.reorderLevel,
            supplier: item.supplier,
            notes: item.notes,
            imageUrl: item.imageUrl || '',
            memberEmails: currentMemberEmails,
            createdByUid: user.uid,
            createdByEmail: signedInEmail,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      }
      await commitChunked(ops);
      notify('success', 'Loaded starter ELA Jewelry catalog into the shared store database.');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'inventory');
    }
  }, [commitLocalStore, currentMemberEmails, notify, signedInEmail, user]);

  // 1. Inventory CRUD
  const addInventoryItem = useCallback(
    async (input: NewItemInput): Promise<InventoryItem> => {
      const id = generateId('inv');
      const item: InventoryItem = {
        id,
        storeId: STORE_ID,
        sku: sanitizeText(input.sku, 40),
        barcode: sanitizeText(input.barcode || input.sku, 40),
        name: sanitizeText(input.name, 120),
        category: input.category,
        costPrice: roundMoney(Math.max(0, Number(input.costPrice) || 0)),
        retailPrice: roundMoney(Math.max(0, Number(input.retailPrice) || 0)),
        quantity: Math.max(0, Math.floor(Number(input.quantity) || 0)),
        reorderLevel: Math.max(0, Math.floor(Number(input.reorderLevel) || 0)),
        supplier: sanitizeText(input.supplier, 100),
        notes: sanitizeText(input.notes, 300),
        imageUrl: sanitizeImageUrl(input.imageUrl || ''),
      };

      if (!user) {
        commitLocalStore((prev) => ({
          ...prev,
          inventory: [item, ...prev.inventory],
        }));
        notify('success', `Recorded "${item.name}" in shared inventory.`);
        return item;
      }

      try {
        await setDoc(doc(db, 'inventory', id), {
          ...item,
          memberEmails: currentMemberEmails,
          createdByUid: user.uid,
          createdByEmail: signedInEmail,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        notify('success', `Synced "${item.name}" across all store users & devices.`);
        return item;
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `inventory/${id}`);
      }
    },
    [commitLocalStore, currentMemberEmails, notify, signedInEmail, user]
  );

  const updateInventoryItem = useCallback(
    async (id: string, input: Partial<NewItemInput>) => {
      const cleaned: Record<string, unknown> = {};
      if (input.sku !== undefined) cleaned.sku = sanitizeText(input.sku, 40);
      if (input.barcode !== undefined) cleaned.barcode = sanitizeText(input.barcode, 40);
      if (input.name !== undefined) cleaned.name = sanitizeText(input.name, 120);
      if (input.category !== undefined) cleaned.category = input.category;
      if (input.costPrice !== undefined)
        cleaned.costPrice = roundMoney(Math.max(0, Number(input.costPrice) || 0));
      if (input.retailPrice !== undefined)
        cleaned.retailPrice = roundMoney(Math.max(0, Number(input.retailPrice) || 0));
      if (input.quantity !== undefined)
        cleaned.quantity = Math.max(0, Math.floor(Number(input.quantity) || 0));
      if (input.reorderLevel !== undefined)
        cleaned.reorderLevel = Math.max(0, Math.floor(Number(input.reorderLevel) || 0));
      if (input.supplier !== undefined) cleaned.supplier = sanitizeText(input.supplier, 100);
      if (input.notes !== undefined) cleaned.notes = sanitizeText(input.notes, 300);
      if (input.imageUrl !== undefined) cleaned.imageUrl = sanitizeImageUrl(input.imageUrl);

      if (!user) {
        commitLocalStore((prev) => ({
          ...prev,
          inventory: prev.inventory.map((it) => (it.id === id ? { ...it, ...cleaned } : it)),
        }));
        notify('success', 'Inventory item updated.');
        return;
      }

      try {
        await updateDoc(doc(db, 'inventory', id), {
          ...cleaned,
          updatedAt: serverTimestamp(),
        });
        notify('success', 'Inventory item synced across all users.');
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `inventory/${id}`);
      }
    },
    [commitLocalStore, notify, user]
  );

  const adjustInventoryQuantity = useCallback(
    async (id: string, delta: number) => {
      const target = store.inventory.find((i) => i.id === id);
      if (!target) return;
      const nextQty = Math.max(0, target.quantity + delta);

      if (!user) {
        commitLocalStore((prev) => ({
          ...prev,
          inventory: prev.inventory.map((it) =>
            it.id === id ? { ...it, quantity: nextQty } : it
          ),
        }));
        notify('success', `Adjusted "${target.name}" stock to ${nextQty}.`);
        return;
      }

      try {
        await updateDoc(doc(db, 'inventory', id), {
          quantity: nextQty,
          updatedAt: serverTimestamp(),
        });
        notify('success', `Adjusted "${target.name}" stock to ${nextQty}.`);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `inventory/${id}`);
      }
    },
    [commitLocalStore, notify, store.inventory, user]
  );

  const deleteInventoryItem = useCallback(
    async (id: string) => {
      if (!user) {
        commitLocalStore((prev) => ({
          ...prev,
          inventory: prev.inventory.filter((it) => it.id !== id),
        }));
        notify('info', 'Item removed from inventory.');
        return;
      }

      try {
        await deleteDoc(doc(db, 'inventory', id));
        notify('info', 'Item removed from shared inventory.');
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `inventory/${id}`);
      }
    },
    [commitLocalStore, notify, user]
  );

  // 2 & 5. Record Sale + Atomic Inventory Deduction (+ Optional Credit Tab)
  const recordSale = useCallback(
    async (input: RecordSaleInput): Promise<SaleRecord> => {
      const { updatedInventory, error } = applySaleToInventory(store.inventory, input.items);
      if (error) {
        notify('error', error);
        throw new Error(error);
      }

      const saleId = generateId('sale');
      const today = getTodayDateString();
      const receiptNumber = `ELA-${Date.now().toString().slice(-6)}`;

      const sale: SaleRecord = {
        id: saleId,
        storeId: STORE_ID,
        receiptNumber,
        items: input.items,
        subtotal: roundMoney(input.subtotal),
        discount: roundMoney(input.discount),
        total: roundMoney(input.total),
        totalCost: roundMoney(input.totalCost),
        paymentMethod: input.paymentMethod,
        status: 'completed',
        customerName: sanitizeText(input.customerName || 'Walk-in Client', 100),
        customerPhone: sanitizeText(input.customerPhone || '', 40),
        cashierName: sanitizeText(activeCashierName, 100),
        saleDate: today,
      };

      let createdDebt: DebtRecord | null = null;
      if (input.paymentMethod === 'Credit / Tab') {
        const deposit = roundMoney(
          Math.max(0, Math.min(input.initialCreditDeposit || 0, sale.total))
        );
        const balance = roundMoney(sale.total - deposit);
        const debtId = generateId('debt');
        createdDebt = {
          id: debtId,
          storeId: STORE_ID,
          customerName: sanitizeText(input.customerName || 'Credit Customer', 100),
          customerPhone: sanitizeText(input.customerPhone || '', 40),
          saleId,
          description: `Receipt ${receiptNumber}: ${input.items
            .map((i) => `${i.name} ×${i.quantity}`)
            .join(', ')}`.slice(0, 240),
          totalAmount: sale.total,
          paidAmount: deposit,
          balance,
          status: balance <= 0.009 ? 'settled' : 'open',
          dueDate: sanitizeText(input.dueDate || '', 40),
          issuedDate: today,
          payments:
            deposit > 0
              ? [
                  {
                    id: generateId('pay'),
                    amount: deposit,
                    method: 'Cash',
                    paidAt: today,
                    note: 'Initial POS deposit',
                    recordedBy: activeCashierName,
                  },
                ]
              : [],
        };
      }

      if (!user) {
        commitLocalStore((prev) => ({
          ...prev,
          inventory: updatedInventory,
          sales: [sale, ...prev.sales],
          debts: createdDebt ? [createdDebt, ...prev.debts] : prev.debts,
        }));
        notify('success', `Sale ${receiptNumber} completed — inventory updated.`);
        return sale;
      }

      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'sales', saleId), {
          ...sale,
          memberEmails: currentMemberEmails,
          createdByUid: user.uid,
          createdByEmail: signedInEmail,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        for (const line of sale.items) {
          const updatedItem = updatedInventory.find((it) => it.id === line.itemId);
          if (updatedItem) {
            batch.update(doc(db, 'inventory', updatedItem.id), {
              quantity: updatedItem.quantity,
              updatedAt: serverTimestamp(),
            });
          }
        }

        if (createdDebt) {
          batch.set(doc(db, 'debts', createdDebt.id), {
            ...createdDebt,
            memberEmails: currentMemberEmails,
            createdByUid: user.uid,
            createdByEmail: signedInEmail,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        await batch.commit();
        notify('success', `Sale ${receiptNumber} synced to shared database.`);
        return sale;
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `sales/${saleId}`);
      }
    },
    [activeCashierName, commitLocalStore, currentMemberEmails, notify, signedInEmail, store.inventory, user]
  );

  const voidSale = useCallback(
    async (saleId: string) => {
      const target = store.sales.find((s) => s.id === saleId);
      if (!target || target.status === 'voided') return;

      if (!user) {
        commitLocalStore((prev) => ({
          ...prev,
          sales: prev.sales.map((s) => (s.id === saleId ? { ...s, status: 'voided' } : s)),
          inventory: prev.inventory.map((it) => {
            const returnedQty = target.items
              .filter((li) => li.itemId === it.id)
              .reduce((sum, li) => sum + li.quantity, 0);
            return returnedQty > 0 ? { ...it, quantity: it.quantity + returnedQty } : it;
          }),
        }));
        notify('info', `Sale ${target.receiptNumber} voided and stock restored.`);
        return;
      }

      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'sales', saleId), {
          status: 'voided',
          updatedAt: serverTimestamp(),
        });
        for (const line of target.items) {
          const item = store.inventory.find((it) => it.id === line.itemId);
          if (item) {
            batch.update(doc(db, 'inventory', item.id), {
              quantity: item.quantity + line.quantity,
              updatedAt: serverTimestamp(),
            });
          }
        }
        await batch.commit();
        notify('info', `Sale ${target.receiptNumber} voided and stock restored.`);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `sales/${saleId}`);
      }
    },
    [commitLocalStore, notify, store.inventory, store.sales, user]
  );

  // 3 & 5. Record Purchase + Atomic Inventory Increment & Weighted Cost Update
  const recordPurchase = useCallback(
    async (input: RecordPurchaseInput): Promise<PurchaseRecord> => {
      const { updatedInventory, error } = applyPurchaseToInventory(store.inventory, input.items);
      if (error) {
        notify('error', error);
        throw new Error(error);
      }

      const purchaseId = generateId('po');
      const totalCost = roundMoney(input.items.reduce((sum, li) => sum + li.lineTotal, 0));

      const purchase: PurchaseRecord = {
        id: purchaseId,
        storeId: STORE_ID,
        invoiceNumber: sanitizeText(
          input.invoiceNumber || `PO-${Date.now().toString().slice(-5)}`,
          40
        ),
        supplierName: sanitizeText(input.supplierName, 100),
        items: input.items,
        totalCost,
        paymentStatus: input.paymentStatus,
        paymentMethod: input.paymentMethod,
        notes: sanitizeText(input.notes, 300),
        purchaseDate: sanitizeText(input.purchaseDate || getTodayDateString(), 40),
        recordedBy: sanitizeText(activeCashierName, 100),
      };

      if (!user) {
        commitLocalStore((prev) => ({
          ...prev,
          inventory: updatedInventory,
          purchases: [purchase, ...prev.purchases],
        }));
        notify('success', `Purchase ${purchase.invoiceNumber} recorded — stock incremented.`);
        return purchase;
      }

      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'purchases', purchaseId), {
          ...purchase,
          memberEmails: currentMemberEmails,
          createdByUid: user.uid,
          createdByEmail: signedInEmail,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        for (const line of purchase.items) {
          const updatedItem = updatedInventory.find((it) => it.id === line.itemId);
          if (updatedItem) {
            batch.update(doc(db, 'inventory', updatedItem.id), {
              quantity: updatedItem.quantity,
              costPrice: updatedItem.costPrice,
              updatedAt: serverTimestamp(),
            });
          }
        }

        await batch.commit();
        notify('success', `Purchase ${purchase.invoiceNumber} synced to shared database.`);
        return purchase;
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `purchases/${purchaseId}`);
      }
    },
    [activeCashierName, commitLocalStore, currentMemberEmails, notify, signedInEmail, store.inventory, user]
  );

  const settleSupplierPurchase = useCallback(
    async (
      purchaseId: string,
      method: Exclude<PurchasePaymentMethod, 'Supplier Credit'>
    ) => {
      if (!user) {
        commitLocalStore((prev) => ({
          ...prev,
          purchases: prev.purchases.map((p) =>
            p.id === purchaseId ? { ...p, paymentStatus: 'Paid', paymentMethod: method } : p
          ),
        }));
        notify('success', 'Supplier invoice marked as Paid.');
        return;
      }

      try {
        await updateDoc(doc(db, 'purchases', purchaseId), {
          paymentStatus: 'Paid',
          paymentMethod: method,
          updatedAt: serverTimestamp(),
        });
        notify('success', 'Supplier invoice marked as Paid.');
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `purchases/${purchaseId}`);
      }
    },
    [commitLocalStore, notify, user]
  );

  // 7. Debt / Credit Recording & Repayments
  const addDebtRecord = useCallback(
    async (input: NewDebtInput): Promise<DebtRecord> => {
      const id = generateId('debt');
      const today = getTodayDateString();
      const totalAmount = roundMoney(Math.max(0.01, Number(input.totalAmount) || 0));
      const paidAmount = roundMoney(
        Math.max(0, Math.min(Number(input.paidAmount) || 0, totalAmount))
      );
      const balance = roundMoney(totalAmount - paidAmount);

      const record: DebtRecord = {
        id,
        storeId: STORE_ID,
        customerName: sanitizeText(input.customerName, 100),
        customerPhone: sanitizeText(input.customerPhone, 40),
        saleId: '',
        description: sanitizeText(input.description, 240),
        totalAmount,
        paidAmount,
        balance,
        status: balance <= 0.009 ? 'settled' : 'open',
        dueDate: sanitizeText(input.dueDate, 40),
        issuedDate: today,
        payments:
          paidAmount > 0
            ? [
                {
                  id: generateId('pay'),
                  amount: paidAmount,
                  method: 'Cash',
                  paidAt: today,
                  note: 'Initial payment',
                  recordedBy: activeCashierName,
                },
              ]
            : [],
      };

      if (!user) {
        commitLocalStore((prev) => ({ ...prev, debts: [record, ...prev.debts] }));
        notify('success', `Opened credit tab for ${record.customerName}.`);
        return record;
      }

      try {
        await setDoc(doc(db, 'debts', id), {
          ...record,
          memberEmails: currentMemberEmails,
          createdByUid: user.uid,
          createdByEmail: signedInEmail,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        notify('success', `Synced credit tab for ${record.customerName}.`);
        return record;
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `debts/${id}`);
      }
    },
    [activeCashierName, commitLocalStore, currentMemberEmails, notify, signedInEmail, user]
  );

  const recordDebtPayment = useCallback(
    async (
      debtId: string,
      amount: number,
      method: Exclude<PaymentMethod, 'Credit / Tab'>,
      note: string
    ) => {
      const target = store.debts.find((d) => d.id === debtId);
      if (!target) return;

      const { updatedDebt, error } = applyDebtRepayment(
        target,
        amount,
        method,
        note,
        activeCashierName,
        getTodayDateString()
      );
      if (error) {
        notify('error', error);
        throw new Error(error);
      }

      if (!user) {
        commitLocalStore((prev) => ({
          ...prev,
          debts: prev.debts.map((d) => (d.id === debtId ? updatedDebt : d)),
        }));
        notify(
          'success',
          updatedDebt.status === 'settled'
            ? `${target.customerName}'s tab is now fully settled.`
            : `Recorded repayment for ${target.customerName}.`
        );
        return;
      }

      try {
        await updateDoc(doc(db, 'debts', debtId), {
          paidAmount: updatedDebt.paidAmount,
          balance: updatedDebt.balance,
          status: updatedDebt.status,
          payments: updatedDebt.payments,
          updatedAt: serverTimestamp(),
        });
        notify(
          'success',
          updatedDebt.status === 'settled'
            ? `${target.customerName}'s tab is now fully settled.`
            : `Recorded repayment for ${target.customerName}.`
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `debts/${debtId}`);
      }
    },
    [activeCashierName, commitLocalStore, notify, store.debts, user]
  );

  // 8. Users & Staff Management (Syncs Shared DB Access & RBAC Across All Store Collections)
  const createStaffMember = useCallback(
    async (input: NewStaffInput): Promise<StaffProfile> => {
      const id = generateId('staff');
      const normalizedEmail = normalizeEmail(input.email);
      const profile: StaffProfile = {
        id,
        storeId: STORE_ID,
        name: sanitizeText(input.name, 100),
        role: input.role,
        status: 'active',
        email: normalizedEmail,
        phone: sanitizeText(input.phone, 40),
        pinCode: sanitizeText(input.pinCode, 20),
        lastPasswordReset: '',
      };

      if (!user) {
        commitLocalStore((prev) => ({ ...prev, staff: [...prev.staff, profile] }));
        notify('success', `Staff account created for ${profile.name}.`);
        return profile;
      }

      const nextStaff = [...store.staff, profile];
      const nextMembership = buildStoreMembership(nextStaff, OWNER_ADMIN_EMAIL);

      try {
        await propagateMembershipCloud(nextStaff, [
          (batch) =>
            batch.set(doc(db, 'staff_members', id), {
              id,
              storeId: STORE_ID,
              name: profile.name,
              role: profile.role,
              status: profile.status,
              memberEmails: nextMembership.memberEmails,
              createdByUid: user.uid,
              createdByEmail: signedInEmail,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }),
          (batch) =>
            batch.set(doc(db, 'staff_private', id), {
              staffId: id,
              storeId: STORE_ID,
              email: profile.email,
              phone: profile.phone,
              pinCode: profile.pinCode,
              lastPasswordReset: '',
              adminEmails: nextMembership.adminEmails,
              createdByUid: user.uid,
              createdByEmail: signedInEmail,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }),
        ]);
        let provisionNote = '';
        if (profile.email && profile.pinCode) {
          const prov = await provisionStaffAuthAccount(
            profile.email,
            toFirebaseAuthPassword(profile.pinCode),
            profile.name
          );
          if (prov.status === 'created') {
            provisionNote = ' Terminal email/PIN login activated.';
          }
        }
        notify(
          'success',
          `${profile.name} (${profile.role}) granted shared database access via ${profile.email || 'staff profile'}.${provisionNote}`
        );
        return profile;
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `staff_members/${id}`);
      }
    },
    [commitLocalStore, notify, propagateMembershipCloud, signedInEmail, store.staff, user]
  );

  const updateStaffMember = useCallback(
    async (
      staffId: string,
      updates: { name: string; phone: string; email: string; role: StaffRole }
    ) => {
      const name = sanitizeText(updates.name, 100);
      const phone = sanitizeText(updates.phone, 40);
      const email = normalizeEmail(updates.email);

      if (!user) {
        commitLocalStore((prev) => ({
          ...prev,
          staff: prev.staff.map((m) =>
            m.id === staffId ? { ...m, name, phone, email, role: updates.role } : m
          ),
        }));
        notify('success', `Updated profile for ${name}.`);
        return;
      }

      const nextStaff = store.staff.map((m) =>
        m.id === staffId ? { ...m, name, phone, email, role: updates.role } : m
      );

      try {
        await propagateMembershipCloud(nextStaff, [
          (batch) =>
            batch.update(doc(db, 'staff_members', staffId), {
              name,
              role: updates.role,
              updatedAt: serverTimestamp(),
            }),
          (batch) =>
            batch.update(doc(db, 'staff_private', staffId), {
              phone,
              email,
              updatedAt: serverTimestamp(),
            }),
        ]);
        notify('success', `Updated profile & store permissions for ${name}.`);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `staff_members/${staffId}`);
      }
    },
    [commitLocalStore, notify, propagateMembershipCloud, store.staff, user]
  );

  const resetStaffPassword = useCallback(
    async (staffId: string, newPinCode: string) => {
      const cleanPin = sanitizeText(newPinCode, 20);
      const resetStamp = getTodayDateString();

      if (!user) {
        commitLocalStore((prev) => ({
          ...prev,
          staff: prev.staff.map((m) =>
            m.id === staffId
              ? {
                  ...m,
                  pinCode: cleanPin,
                  status: 'password_reset_required',
                  lastPasswordReset: resetStamp,
                }
              : m
          ),
        }));
        notify('success', 'Password/PIN reset issued successfully.');
        return;
      }

      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'staff_members', staffId), {
          status: 'password_reset_required',
          updatedAt: serverTimestamp(),
        });
        batch.update(doc(db, 'staff_private', staffId), {
          pinCode: cleanPin,
          lastPasswordReset: resetStamp,
          updatedAt: serverTimestamp(),
        });
        await batch.commit();
        notify('success', 'Password/PIN reset synced across all terminals.');
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `staff_private/${staffId}`);
      }
    },
    [commitLocalStore, notify, user]
  );

  const deleteStaffMember = useCallback(
    async (staffId: string) => {
      const target = store.staff.find((m) => m.id === staffId);
      if (target && isBootstrappedAdminEmail(target.email)) {
        notify('error', 'The primary store owner account cannot be deleted.');
        return;
      }

      if (!user) {
        commitLocalStore((prev) => ({
          ...prev,
          staff: prev.staff.filter((m) => m.id !== staffId),
        }));
        notify('info', 'Staff user deleted.');
        return;
      }

      const nextStaff = store.staff.filter((m) => m.id !== staffId);

      try {
        await propagateMembershipCloud(
          nextStaff,
          [
            (batch) => batch.delete(doc(db, 'staff_private', staffId)),
            (batch) => batch.delete(doc(db, 'staff_members', staffId)),
          ],
          new Set([staffId])
        );
        notify('info', 'Staff user deleted and revoked from shared store database.');
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `staff_members/${staffId}`);
      }
    },
    [commitLocalStore, notify, propagateMembershipCloud, store.staff, user]
  );

  const removeAllOtherUsers = useCallback(async (): Promise<number> => {
    const primaryAdmin =
      store.staff.find((m) => normalizeEmail(m.email) === OWNER_ADMIN_EMAIL) ||
      store.staff.find((m) => m.role === 'Admin') ||
      store.staff[0] ||
      null;
    const toRemove = store.staff.filter((m) => m.id !== primaryAdmin?.id);

    if (toRemove.length === 0) {
      notify('info', 'No additional staff users to remove.');
      return 0;
    }

    if (!user) {
      commitLocalStore((prev) => ({
        ...prev,
        staff: primaryAdmin ? [primaryAdmin] : [],
      }));
      notify('success', `Removed ${toRemove.length} staff user(s) from all registers.`);
      return toRemove.length;
    }

    const nextStaff = primaryAdmin ? [primaryAdmin] : [];
    const skipIds = new Set(toRemove.map((m) => m.id));

    try {
      await propagateMembershipCloud(
        nextStaff,
        toRemove.flatMap((member) => [
          (batch: WriteBatch) => batch.delete(doc(db, 'staff_private', member.id)),
          (batch: WriteBatch) => batch.delete(doc(db, 'staff_members', member.id)),
        ]),
        skipIds
      );
      notify(
        'success',
        `Removed ${toRemove.length} user(s) and revoked their access to the shared database.`
      );
      return toRemove.length;
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'staff_members');
    }
  }, [commitLocalStore, notify, propagateMembershipCloud, store.staff, user]);

  // 9.2 Yearly Reset (Preserves Open Tabs & Current Inventory)
  const performYearlyReset = useCallback(async () => {
    const clearedSales = store.sales.length;
    const clearedPurchases = store.purchases.length;
    const settledDebts = store.debts.filter((d) => d.status === 'settled' || d.balance <= 0);
    const clearedSettledDebts = settledDebts.length;

    if (!user) {
      commitLocalStore((prev) => applyYearlyReset(prev));
      notify(
        'success',
        `Yearly Reset complete. Cleared ${clearedSales} sales, ${clearedPurchases} purchases & ${clearedSettledDebts} settled tabs. Current inventory & open tabs preserved.`
      );
      return { clearedSales, clearedPurchases, clearedSettledDebts };
    }

    try {
      const ops: Array<(batch: WriteBatch) => void> = [
        ...store.sales.map((s) => (batch: WriteBatch) => batch.delete(doc(db, 'sales', s.id))),
        ...store.purchases.map(
          (p) => (batch: WriteBatch) => batch.delete(doc(db, 'purchases', p.id))
        ),
        ...settledDebts.map((d) => (batch: WriteBatch) => batch.delete(doc(db, 'debts', d.id))),
      ];
      await commitChunked(ops);
      notify(
        'success',
        `Yearly Reset synced for all users. Cleared ${clearedSales} sales, ${clearedPurchases} purchases & ${clearedSettledDebts} settled tabs. Inventory & open tabs preserved.`
      );
      return { clearedSales, clearedPurchases, clearedSettledDebts };
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'yearly_reset');
    }
  }, [commitLocalStore, notify, store.debts, store.purchases, store.sales, user]);

  // 9.1 Reset Everything
  const performFullReset = useCallback(
    async (includeStaff: boolean) => {
      const primaryAdmin =
        store.staff.find((m) => normalizeEmail(m.email) === OWNER_ADMIN_EMAIL) ||
        store.staff.find((m) => m.role === 'Admin') ||
        store.staff[0] ||
        null;

      if (!user) {
        commitLocalStore((prev) =>
          applyFullReset(prev, includeStaff ? undefined : primaryAdmin?.id)
        );
        notify('info', 'Full system reset completed. All shared POS ledgers cleared.');
        return;
      }

      try {
        const ops: Array<(batch: WriteBatch) => void> = [
          ...store.inventory.map(
            (item) => (batch: WriteBatch) => batch.delete(doc(db, 'inventory', item.id))
          ),
          ...store.sales.map((s) => (batch: WriteBatch) => batch.delete(doc(db, 'sales', s.id))),
          ...store.purchases.map(
            (p) => (batch: WriteBatch) => batch.delete(doc(db, 'purchases', p.id))
          ),
          ...store.debts.map((d) => (batch: WriteBatch) => batch.delete(doc(db, 'debts', d.id))),
        ];
        if (includeStaff) {
          const retainedAdmins = Array.from(
            new Set([OWNER_ADMIN_EMAIL, ...(signedInEmail ? [signedInEmail] : [])])
          );
          for (const m of store.staff) {
            if (isBootstrappedAdminEmail(m.email)) continue;
            ops.push((batch) => batch.delete(doc(db, 'staff_private', m.id)));
            ops.push((batch) => batch.delete(doc(db, 'staff_members', m.id)));
          }
          ops.push((batch) =>
            batch.update(doc(db, 'store_config', STORE_ID), {
              storeName: 'ELA Jewelry',
              adminEmails: retainedAdmins,
              managerEmails: [],
              cashierEmails: [],
              memberEmails: retainedAdmins,
              updatedAt: serverTimestamp(),
            })
          );
        }
        await commitChunked(ops);
        notify('info', 'Full system reset completed across all synced users & devices.');
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, 'full_reset');
      }
    },
    [
      commitLocalStore,
      notify,
      store.debts,
      store.inventory,
      store.purchases,
      store.sales,
      store.staff,
      user,
    ]
  );

  const value = useMemo<PosContextValue>(
    () => ({
      user,
      authReady,
      accessStatus,
      currentUserRole,
      can,
      storeConfig,
      authorizedMemberCount,
      syncMode,
      enteredApp,
      loadingData,
      lastSyncedAt,
      inventory: store.inventory,
      sales: store.sales,
      purchases: store.purchases,
      debts: store.debts,
      staff: store.staff,
      activeCashierName,
      activeLocalStaffId,
      switchLocalStaff,
      toast,
      dismissToast,
      notify,
      signInToTerminal,
      completeFirstTimeStoreSetup,
      refreshCloudConnection,
      signInWithGoogle,
      signOutUser,
      recheckStoreAccess,
      enterDemoWorkspace,
      seedCloudCatalog,
      addInventoryItem,
      updateInventoryItem,
      adjustInventoryQuantity,
      deleteInventoryItem,
      recordSale,
      voidSale,
      recordPurchase,
      settleSupplierPurchase,
      addDebtRecord,
      recordDebtPayment,
      createStaffMember,
      updateStaffMember,
      resetStaffPassword,
      deleteStaffMember,
      removeAllOtherUsers,
      performYearlyReset,
      performFullReset,
    }),
    [
      user,
      authReady,
      accessStatus,
      currentUserRole,
      can,
      storeConfig,
      authorizedMemberCount,
      syncMode,
      enteredApp,
      loadingData,
      lastSyncedAt,
      store,
      activeCashierName,
      activeLocalStaffId,
      switchLocalStaff,
      toast,
      dismissToast,
      notify,
      signInToTerminal,
      completeFirstTimeStoreSetup,
      refreshCloudConnection,
      signInWithGoogle,
      signOutUser,
      recheckStoreAccess,
      enterDemoWorkspace,
      seedCloudCatalog,
      addInventoryItem,
      updateInventoryItem,
      adjustInventoryQuantity,
      deleteInventoryItem,
      recordSale,
      voidSale,
      recordPurchase,
      settleSupplierPurchase,
      addDebtRecord,
      recordDebtPayment,
      createStaffMember,
      updateStaffMember,
      resetStaffPassword,
      deleteStaffMember,
      removeAllOtherUsers,
      performYearlyReset,
      performFullReset,
    ]
  );

  return <PosContext.Provider value={value}>{children}</PosContext.Provider>;
};

export function usePos(): PosContextValue {
  const ctx = useContext(PosContext);
  if (!ctx) throw new Error('usePos must be used within a PosProvider');
  return ctx;
}
