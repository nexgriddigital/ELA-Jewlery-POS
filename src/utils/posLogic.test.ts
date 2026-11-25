import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDebtRepayment,
  applyFullReset,
  applyPurchaseToInventory,
  applySaleToInventory,
  applyYearlyReset,
  calculateInventoryValuation,
  computeCartTotals,
  generateDebtReport,
  generatePurchaseReport,
  generateSalesReport,
} from './posLogic';
import { encodeCode128B } from './barcode';
import { DebtRecord, InventoryItem, PosStoreState, PurchaseRecord, SaleRecord } from '../types/pos';

const sampleInventory: InventoryItem[] = [
  {
    id: 'item_1',
    sku: 'ELA-GLD-01',
    barcode: '8901001001',
    name: '18K Gold Rope Chain',
    category: 'Jewelry',
    costPrice: 120,
    retailPrice: 240,
    quantity: 10,
    reorderLevel: 3,
    supplier: 'Addis Fine Metals',
    notes: '20 inch',
    ownerUid: 'owner_1',
  },
  {
    id: 'item_2',
    sku: 'ELA-PRF-01',
    barcode: '8901001002',
    name: 'Velvet Oud 100ml',
    category: 'Perfumes',
    costPrice: 40,
    retailPrice: 95,
    quantity: 2,
    reorderLevel: 5,
    supplier: 'Maison Orient',
    notes: 'Eau de Parfum',
    ownerUid: 'owner_1',
  },
];

test('computeCartTotals and applySaleToInventory deduct stock accurately and block overselling', () => {
  const cart = computeCartTotals(
    [
      { item: sampleInventory[0], quantity: 2 },
      { item: sampleInventory[1], quantity: 1 },
    ],
    25
  );

  assert.equal(cart.subtotal, 575);
  assert.equal(cart.discount, 25);
  assert.equal(cart.total, 550);
  assert.equal(cart.totalCost, 280);

  const ok = applySaleToInventory(sampleInventory, cart.items);
  assert.equal(ok.error, undefined);
  assert.equal(ok.updatedInventory[0].quantity, 8);
  assert.equal(ok.updatedInventory[1].quantity, 1);

  const oversell = applySaleToInventory(sampleInventory, [
    { ...cart.items[1], quantity: 5 },
  ]);
  assert.ok(oversell.error?.includes('Insufficient stock'));
});

test('applyPurchaseToInventory increases stock and recalculates weighted average cost', () => {
  const res = applyPurchaseToInventory(sampleInventory, [
    {
      itemId: 'item_1',
      sku: 'ELA-GLD-01',
      name: '18K Gold Rope Chain',
      quantity: 10,
      unitCost: 140,
      lineTotal: 1400,
    },
  ]);

  assert.equal(res.error, undefined);
  assert.equal(res.updatedInventory[0].quantity, 20);
  // (10 * 120 + 10 * 140) / 20 = 130
  assert.equal(res.updatedInventory[0].costPrice, 130);
});

test('calculateInventoryValuation computes Retail Value (6.3.1) and Cost Value (6.3.2)', () => {
  const val = calculateInventoryValuation(sampleInventory);
  // Cost: 10*120 + 2*40 = 1280
  // Retail: 10*240 + 2*95 = 2590
  assert.equal(val.totalCostValue, 1280);
  assert.equal(val.totalRetailValue, 2590);
  assert.equal(val.potentialGrossProfit, 1310);
  assert.equal(val.lowStockCount, 1);
  assert.equal(val.byCategory.length, 2);
});

test('generateSalesReport filters by date range and aggregates payment methods', () => {
  const sales: SaleRecord[] = [
    {
      id: 's1',
      receiptNumber: 'ELA-1001',
      items: [
        {
          itemId: 'item_1',
          sku: 'ELA-GLD-01',
          name: '18K Gold Rope Chain',
          category: 'Jewelry',
          quantity: 1,
          unitPrice: 240,
          unitCost: 120,
          lineTotal: 240,
        },
      ],
      subtotal: 240,
      discount: 0,
      total: 240,
      totalCost: 120,
      paymentMethod: 'Card',
      status: 'completed',
      customerName: 'Walk-in',
      customerPhone: '',
      cashierName: 'Sara',
      saleDate: '2026-11-15',
      ownerUid: 'owner_1',
    },
    {
      id: 's2',
      receiptNumber: 'ELA-1002',
      items: [
        {
          itemId: 'item_2',
          sku: 'ELA-PRF-01',
          name: 'Velvet Oud 100ml',
          category: 'Perfumes',
          quantity: 2,
          unitPrice: 95,
          unitCost: 40,
          lineTotal: 190,
        },
      ],
      subtotal: 190,
      discount: 10,
      total: 180,
      totalCost: 80,
      paymentMethod: 'Cash',
      status: 'completed',
      customerName: 'Walk-in',
      customerPhone: '',
      cashierName: 'Sara',
      saleDate: '2026-11-20',
      ownerUid: 'owner_1',
    },
    {
      id: 's3',
      receiptNumber: 'ELA-1003',
      items: [
        {
          itemId: 'item_2',
          sku: 'ELA-PRF-01',
          name: 'Velvet Oud 100ml',
          category: 'Perfumes',
          quantity: 1,
          unitPrice: 95,
          unitCost: 40,
          lineTotal: 95,
        },
      ],
      subtotal: 95,
      discount: 0,
      total: 95,
      totalCost: 40,
      paymentMethod: 'Mobile Money',
      status: 'completed',
      customerName: 'Old Sale',
      customerPhone: '',
      cashierName: 'Sara',
      saleDate: '2026-09-01',
      ownerUid: 'owner_1',
    },
  ];

  const report = generateSalesReport(sales, { from: '2026-11-01', to: '2026-11-30' });
  assert.equal(report.transactionCount, 2);
  assert.equal(report.grossRevenue, 420);
  assert.equal(report.totalCostOfGoods, 200);
  assert.equal(report.netProfit, 220);

  const cardRow = report.byPaymentMethod.find((m) => m.method === 'Card');
  const cashRow = report.byPaymentMethod.find((m) => m.method === 'Cash');
  assert.equal(cardRow?.total, 240);
  assert.equal(cashRow?.total, 180);
});

test('applyDebtRepayment handles partial payment then full settlement and blocks overpayment', () => {
  const debt: DebtRecord = {
    id: 'd1',
    customerName: 'Hana Tesfaye',
    customerPhone: '+251-911-000111',
    saleId: 's1',
    description: 'Bridal Jewelry Set',
    totalAmount: 300,
    paidAmount: 0,
    balance: 300,
    status: 'open',
    dueDate: '2026-12-10',
    issuedDate: '2026-11-10',
    payments: [],
    ownerUid: 'owner_1',
  };

  const overpay = applyDebtRepayment(debt, 350, 'Cash', 'Too much', 'Admin', '2026-11-12');
  assert.ok(overpay.error?.includes('exceeds'));

  const partial = applyDebtRepayment(debt, 100, 'Cash', 'First installment', 'Admin', '2026-11-12');
  assert.equal(partial.error, undefined);
  assert.equal(partial.updatedDebt.balance, 200);
  assert.equal(partial.updatedDebt.status, 'open');

  const finalPay = applyDebtRepayment(
    partial.updatedDebt,
    200,
    'Bank Transfer',
    'Final settlement',
    'Admin',
    '2026-11-18'
  );
  assert.equal(finalPay.error, undefined);
  assert.equal(finalPay.updatedDebt.balance, 0);
  assert.equal(finalPay.updatedDebt.status, 'settled');
  assert.equal(finalPay.updatedDebt.payments.length, 2);
});

test('applyYearlyReset preserves current inventory and open debt tabs while clearing sales, purchases, and settled tabs', () => {
  const purchase: PurchaseRecord = {
    id: 'p1',
    invoiceNumber: 'INV-900',
    supplierName: 'Addis Fine Metals',
    items: [
      { itemId: 'item_1', sku: 'ELA-GLD-01', name: '18K Gold Rope Chain', quantity: 5, unitCost: 120, lineTotal: 600 },
    ],
    totalCost: 600,
    paymentStatus: 'Paid',
    paymentMethod: 'Bank Transfer',
    notes: '',
    purchaseDate: '2026-11-10',
    recordedBy: 'Admin',
    ownerUid: 'owner_1',
  };

  const openDebt: DebtRecord = {
    id: 'd_open',
    customerName: 'Selamawit B.',
    customerPhone: '0911223344',
    saleId: 's1',
    description: 'Gold Bangle',
    totalAmount: 200,
    paidAmount: 50,
    balance: 150,
    status: 'open',
    dueDate: '2026-12-30',
    issuedDate: '2026-11-15',
    payments: [],
    ownerUid: 'owner_1',
  };

  const settledDebt: DebtRecord = {
    ...openDebt,
    id: 'd_settled',
    paidAmount: 200,
    balance: 0,
    status: 'settled',
  };

  const state: PosStoreState = {
    inventory: sampleInventory,
    sales: [
      {
        id: 's1',
        receiptNumber: 'ELA-1',
        items: [],
        subtotal: 100,
        discount: 0,
        total: 100,
        totalCost: 50,
        paymentMethod: 'Cash',
        status: 'completed',
        customerName: 'Guest',
        customerPhone: '',
        cashierName: 'Admin',
        saleDate: '2026-11-15',
        ownerUid: 'owner_1',
      },
    ],
    purchases: [purchase],
    debts: [openDebt, settledDebt],
    staff: [
      {
        id: 'staff_admin',
        name: 'Owner Admin',
        role: 'Admin',
        status: 'active',
        email: 'owner@ela.com',
        phone: '+251900000000',
        pinCode: '1234',
        lastPasswordReset: '',
        ownerUid: 'owner_1',
      },
    ],
  };

  const yearly = applyYearlyReset(state);
  assert.equal(yearly.sales.length, 0);
  assert.equal(yearly.purchases.length, 0);
  assert.equal(yearly.inventory.length, 2);
  assert.equal(yearly.debts.length, 1);
  assert.equal(yearly.debts[0].id, 'd_open');
  assert.equal(yearly.staff.length, 1);

  const full = applyFullReset(state, 'staff_admin');
  assert.equal(full.inventory.length, 0);
  assert.equal(full.debts.length, 0);
  assert.equal(full.staff.length, 1);

  const purchaseRep = generatePurchaseReport([purchase], { from: '2026-11-01', to: '2026-11-30' });
  assert.equal(purchaseRep.totalSpend, 600);

  const debtRep = generateDebtReport([openDebt, settledDebt], { from: '2026-11-01', to: '2026-11-30' });
  assert.equal(debtRep.openTabsCount, 1);
  assert.equal(debtRep.totalOutstandingBalance, 150);
});

test('encodeCode128B produces valid vector barcode modules', () => {
  const encoded = encodeCode128B('ELA-GLD-01');
  assert.equal(encoded.normalizedText, 'ELA-GLD-01');
  assert.ok(encoded.bars.length > 20);
  assert.ok(encoded.totalModules > 100);
});

test('buildStoreMembership, resolveUserRole, and canPerformRoleAction enforce shared-database RBAC', async () => {
  const { buildStoreMembership, resolveUserRole, canPerformRoleAction } = await import('./posLogic');
  const membership = buildStoreMembership(
    [
      { email: 'Rahel.Girma@gmail.com', role: 'Manager', status: 'active' },
      { email: 'yonas.k@gmail.com', role: 'Cashier', status: 'active' },
      { email: 'fired@gmail.com', role: 'Cashier', status: 'revoked' },
    ],
    'amanuealhailu007@gmail.com'
  );

  assert.deepEqual(membership.adminEmails, ['amanuealhailu007@gmail.com']);
  assert.deepEqual(membership.managerEmails, ['rahel.girma@gmail.com']);
  assert.deepEqual(membership.cashierEmails, ['yonas.k@gmail.com']);
  assert.equal(membership.memberEmails.includes('fired@gmail.com'), false);
  assert.equal(membership.memberEmails.length, 3);

  assert.equal(resolveUserRole('AMANUEALHAILU007@gmail.com', membership, 'amanuealhailu007@gmail.com'), 'Admin');
  assert.equal(resolveUserRole('rahel.girma@gmail.com', membership, 'amanuealhailu007@gmail.com'), 'Manager');
  assert.equal(resolveUserRole('yonas.k@gmail.com', membership, 'amanuealhailu007@gmail.com'), 'Cashier');
  assert.equal(resolveUserRole('stranger@gmail.com', membership, 'amanuealhailu007@gmail.com'), null);

  assert.equal(canPerformRoleAction('Cashier', 'pos'), true);
  assert.equal(canPerformRoleAction('Cashier', 'purchases'), false);
  assert.equal(canPerformRoleAction('Cashier', 'staff_admin'), false);
  assert.equal(canPerformRoleAction('Manager', 'purchases'), true);
  assert.equal(canPerformRoleAction('Manager', 'system_reset'), false);
  assert.equal(canPerformRoleAction('Admin', 'system_reset'), true);
});

test('validateTerminalSecret, toFirebaseAuthPassword, and authenticateLocalStaff support 4-digit PIN and password login', async () => {
  const {
    isFourDigitPin,
    validateTerminalSecret,
    toFirebaseAuthPassword,
    authenticateLocalStaff,
  } = await import('./posLogic');

  assert.equal(isFourDigitPin('8800'), true);
  assert.equal(isFourDigitPin('12345'), false);
  assert.equal(isFourDigitPin('abcd'), false);

  assert.equal(validateTerminalSecret('8800').valid, true);
  assert.equal(validateTerminalSecret('8800').mode, 'pin');
  assert.equal(validateTerminalSecret('SecurePass!9').valid, true);
  assert.equal(validateTerminalSecret('SecurePass!9').mode, 'password');
  assert.equal(validateTerminalSecret('123').valid, false);
  assert.equal(validateTerminalSecret('12345').valid, false);

  assert.equal(toFirebaseAuthPassword('8800'), 'ELAPin#8800');
  assert.equal(toFirebaseAuthPassword('MyStorePass2026'), 'MyStorePass2026');

  const staff = [
    { id: 'staff_owner', email: 'amanuealhailu007@gmail.com', pinCode: '8800', status: 'active' },
    { id: 'staff_cash', email: 'yonas.k@elajewelry.store', pinCode: '3190', status: 'active' },
    { id: 'staff_revoked', email: 'former@elajewelry.store', pinCode: '9999', status: 'revoked' },
  ];

  const okOwner = authenticateLocalStaff(staff, 'AMANUEALHAILU007@gmail.com', '8800');
  assert.equal(okOwner.ok, true);
  if (okOwner.ok) assert.equal(okOwner.staff.id, 'staff_owner');

  const badPin = authenticateLocalStaff(staff, 'yonas.k@elajewelry.store', '0000');
  assert.equal(badPin.ok, false);

  const revoked = authenticateLocalStaff(staff, 'former@elajewelry.store', '9999');
  assert.equal(revoked.ok, false);
});

