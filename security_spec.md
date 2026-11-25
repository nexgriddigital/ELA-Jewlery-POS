# ELA Jewelry POS — Multi-User Shared Database Security Specification

## 1. Data Invariants (Multiple Users = One Database)
1. **Single Shared Store (`storeId = 'ela_jewelry_main'`)**: All authorized ELA Jewelry users (Admin, Manager, Cashier) read and write to one synchronized Firestore database rather than isolated per-user silos.
2. **Master Gate (`/store_config/ela_jewelry_main`)**: Single source of truth for authorized emails partitioned by role (`adminEmails`, `managerEmails`, `cashierEmails`, `memberEmails`). Bootstrapped owner `amanuealhailu007@gmail.com` (verified email required) is permanently retained as Admin.
3. **Tiered Role-Based Access Control (RBAC)**:
   - **Admin**: Full access including Staff CRUD, Password Reset, Remove All Other Users, Yearly Reset, and Reset Everything.
   - **Manager**: Manage inventory, record/settle purchases, void sales, record sales & debt repayments. Cannot modify staff accounts, view other staff PII, or wipe the database.
   - **Cashier**: Read shared catalog/ledger, record sales (`sales` create), deduct sold stock (`inventory` quantity-only update), and open/collect customer debt tabs (`debts`). Cannot edit product prices, delete stock, record purchases, or view staff PII.
4. **Zero-`get()` Secure List Queries**: Every `allow list` enforces `userEmail() in existing().memberEmails` (or `adminEmails` for `staff_private`) directly on `resource.data` without `get()` or `exists()` calls, and uses single-field `array-contains` queries requiring zero composite indexes.
5. **PII Split Collection**: `staff_private` (emails, phone numbers, PINs) restricts `list` strictly to `adminEmails` and `get` strictly to `isStoreAdmin()` or the staff member's own record.
6. **Synchronous Revocation**: Deleting a user or executing "Remove All Other Users" atomically updates `store_config/ela_jewelry_main` and strips their email from `memberEmails` across all store documents.

## 2. Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Unauthorized Google User Access**: A signed-in verified Google account NOT listed in `store_config.memberEmails` attempting to list or read `/inventory` or `/sales`.
2. **Unverified Admin Email Spoof**: Accessing `/store_config/ela_jewelry_main` with `email: "amanuealhailu007@gmail.com"` and `email_verified: false`.
3. **Cashier Privilege Escalation (Price Tampering)**: A `Cashier` attempting to update `retailPrice` or `costPrice` on `/inventory/{itemId}` (only `quantity` + `updatedAt` allowed for Cashiers).
4. **Cashier Staff PII Read**: A `Cashier` attempting to list or get another staff member's `/staff_private/{staffId}`.
5. **Manager Admin Takeover**: A `Manager` attempting to update `/store_config/ela_jewelry_main` to add themselves to `adminEmails`.
6. **Manager / Cashier Database Wipe**: A `Manager` or `Cashier` attempting to delete `/inventory/{itemId}` or `/sales/{saleId}`.
7. **Shadow / Ghost Field Injection**: Any user attempting to write an undeclared key (e.g., `isFree: true`) to any collection.
8. **Identity Spoofing on Create**: Creating a sale with `createdByUid != request.auth.uid` or `createdByEmail != userEmail()`.
9. **Timestamp Forgery**: Creating or updating a record with client-provided timestamps instead of `request.time`.
10. **Terminal State Bypass**: A `Cashier` attempting to reopen a `settled` debt or un-void a `voided` sale.
11. **ID Poisoning**: Creating documents with IDs longer than 64 chars or containing invalid characters.
12. **Owner Lockout**: Attempting to update `store_config/ela_jewelry_main` while removing `amanuealhailu007@gmail.com` from `adminEmails` or `memberEmails`.
