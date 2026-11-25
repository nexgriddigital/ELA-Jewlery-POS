import React, { useState } from 'react';
import { UserPlus, Pencil, KeyRound, Trash2, UserX, X, AlertTriangle } from 'lucide-react';
import { usePos } from '../context/PosContext';
import { StaffProfile, StaffRole } from '../types/pos';
import { validateTerminalSecret } from '../utils/posLogic';

const STAFF_ROLES: StaffRole[] = ['Admin', 'Manager', 'Cashier'];

export const StaffView: React.FC = () => {
  const {
    staff,
    createStaffMember,
    updateStaffMember,
    resetStaffPassword,
    deleteStaffMember,
    removeAllOtherUsers,
    notify,
  } = usePos();

  // 8.1 Create Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRole, setNewRole] = useState<StaffRole>('Cashier');
  const [newPin, setNewPin] = useState('');

  // 8.3 Edit Name & Phone Modal
  const [editTarget, setEditTarget] = useState<StaffProfile | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<StaffRole>('Cashier');

  // 8.2 Password / PIN Reset Modal
  const [resetTarget, setResetTarget] = useState<StaffProfile | null>(null);
  const [resetPin, setResetPin] = useState('');

  // 8.4 Delete Individual User Modal
  const [deleteTarget, setDeleteTarget] = useState<StaffProfile | null>(null);

  // 8.5 Remove from All Users Modal
  const [removeAllOpen, setRemoveAllOpen] = useState(false);
  const [removeConfirmText, setRemoveConfirmText] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      notify('error', 'Staff full name is required.');
      return;
    }
    const pinCheck = validateTerminalSecret(newPin);
    if (!pinCheck.valid) {
      notify('error', pinCheck.error || 'Enter a 4-digit PIN or a password of at least 6 characters.');
      return;
    }

    await createStaffMember({
      name: newName.trim(),
      email: newEmail.trim(),
      phone: newPhone.trim(),
      role: newRole,
      pinCode: newPin.trim(),
    });
    setCreateOpen(false);
    setNewName('');
    setNewEmail('');
    setNewPhone('');
    setNewRole('Cashier');
    setNewPin('');
  };

  const openEdit = (member: StaffProfile) => {
    setEditTarget(member);
    setEditName(member.name);
    setEditPhone(member.phone);
    setEditEmail(member.email);
    setEditRole(member.role);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    if (!editName.trim()) {
      notify('error', 'Staff name cannot be empty.');
      return;
    }
    await updateStaffMember(editTarget.id, {
      name: editName.trim(),
      phone: editPhone.trim(),
      email: editEmail.trim(),
      role: editRole,
    });
    setEditTarget(null);
  };

  const openReset = (member: StaffProfile) => {
    setResetTarget(member);
    const suggested = String(Math.floor(100000 + Math.random() * 900000));
    setResetPin(suggested);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    if (resetPin.trim().length < 4) {
      notify('error', 'New temporary password / PIN must be at least 4 characters.');
      return;
    }
    await resetStaffPassword(resetTarget.id, resetPin.trim());
    setResetTarget(null);
    setResetPin('');
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    await deleteStaffMember(deleteTarget.id);
    setDeleteTarget(null);
  };

  const handleRemoveAllOtherUsers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (removeConfirmText.trim().toUpperCase() !== 'REMOVE ALL') {
      notify('error', 'Type REMOVE ALL to confirm revoking all other users.');
      return;
    }
    await removeAllOtherUsers();
    setRemoveAllOpen(false);
    setRemoveConfirmText('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[#231712]">
            Users &amp; Staff Administration
          </h1>
          <p className="text-sm text-[#766257] mt-0.5">
            Create staff accounts, reset passwords/PINs, edit names &amp; phone numbers, or revoke
            access across all devices
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              setRemoveConfirmText('');
              setRemoveAllOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-[#D0311E]/50 hover:bg-[#FCE8E6] text-[#BE1A1A] text-sm font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <UserX className="w-4 h-4" aria-hidden="true" />
            <span>Remove All Other Users</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setNewPin(String(Math.floor(1000 + Math.random() * 9000)));
              setCreateOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#BE1A1A] hover:bg-[#D0311E] text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <UserPlus className="w-4 h-4" aria-hidden="true" />
            <span>Add Staff User</span>
          </button>
        </div>
      </div>

      {/* Shared Single-Database Access Info */}
      <div className="bg-[#FFFDF7] border border-[#F7D87F] rounded-xl px-4 py-3 text-xs text-[#5C493F] flex flex-wrap items-center justify-between gap-2">
        <span>
          <strong className="text-[#231712]">One Shared Store Database:</strong> Add each staff
          member&apos;s email and 4-digit Quick Terminal PIN or password here. When they sign in at
          any phone, tablet, or counter terminal, they automatically connect to the same live ELA
          Jewelry inventory, sales, and credit ledger with their assigned role (
          <strong className="text-[#231712]">Admin</strong>,{' '}
          <strong className="text-[#231712]">Manager</strong>, or{' '}
          <strong className="text-[#231712]">Cashier</strong>).
        </span>
      </div>

      {/* Staff Table */}
      <div className="bg-white border border-[#E8DFD3] rounded-xl overflow-hidden">
        {staff.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#766257]">
            No staff users configured yet. Click &ldquo;Add Staff User&rdquo; to create your first
            account.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-[#FAF8F5] text-xs text-[#766257] border-b border-[#E8DFD3]">
                <tr>
                  <th className="px-4 py-3 font-medium">Staff Name</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Phone Number</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8DFD3]">
                {staff.map((member) => (
                  <tr key={member.id} className="hover:bg-[#FAF8F5]/75">
                    <td className="px-4 py-3 font-semibold text-[#231712] whitespace-nowrap">
                      {member.name}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-[#5C493F] whitespace-nowrap">
                      {member.role}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[#231712] whitespace-nowrap">
                      {member.phone || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#766257] whitespace-nowrap">
                      {member.email || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      {member.status === 'password_reset_required' ? (
                        <span className="text-[#D0311E] font-semibold">
                          Reset Issued ({member.lastPasswordReset || 'Pending'})
                        </span>
                      ) : member.status === 'revoked' ? (
                        <span className="text-[#BE1A1A] font-semibold">Revoked</span>
                      ) : (
                        <span className="text-[#16A34A] font-semibold">Active</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEdit(member)}
                          aria-label={`Edit name and phone for ${member.name}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#231712] bg-[#FAF8F5] hover:bg-[#F8EBAB]/60 border border-[#E8DFD3] rounded-md cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openReset(member)}
                          aria-label={`Reset password for ${member.name}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#231712] bg-[#FAF8F5] hover:bg-[#F8EBAB]/60 border border-[#E8DFD3] rounded-md cursor-pointer"
                        >
                          <KeyRound className="w-3.5 h-3.5 text-[#BE1A1A]" aria-hidden="true" />
                          <span>Reset Password</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(member)}
                          aria-label={`Delete user ${member.name}`}
                          className="p-1.5 text-[#766257] hover:text-[#BE1A1A] hover:bg-[#FCE8E6] rounded-md cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 8.1 Create Staff Modal */}
      {createOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-staff-title"
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleCreate}
            className="bg-white border border-[#E8DFD3] rounded-2xl max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-[#E8DFD3] pb-3">
              <h2 id="create-staff-title" className="font-display text-xl font-semibold text-[#231712]">
                Create Staff Account
              </h2>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                aria-label="Close create staff modal"
                className="p-1.5 rounded-lg text-[#766257] hover:bg-[#FAF8F5] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label htmlFor="staff-new-name" className="block text-xs font-semibold text-[#231712] mb-1">
                  Full Name *
                </label>
                <input
                  id="staff-new-name"
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., Bethlehem Tadesse"
                  className="w-full px-3 py-2 text-sm bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg"
                />
              </div>

              <div>
                <label htmlFor="staff-new-phone" className="block text-xs font-semibold text-[#231712] mb-1">
                  Phone Number *
                </label>
                <input
                  id="staff-new-phone"
                  type="tel"
                  required
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="+251-911-..."
                  className="w-full px-3 py-2 text-sm font-mono bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg"
                />
              </div>

              <div>
                <label htmlFor="staff-new-email" className="block text-xs font-semibold text-[#231712] mb-1">
                  Staff Email Address (Terminal Login) *
                </label>
                <input
                  id="staff-new-email"
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="e.g. staff@elajewelry.store"
                  className="w-full px-3 py-2 text-sm bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="staff-new-role" className="block text-xs font-semibold text-[#231712] mb-1">
                    Role
                  </label>
                  <select
                    id="staff-new-role"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as StaffRole)}
                    className="w-full px-3 py-2 text-sm bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg"
                  >
                    {STAFF_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="staff-new-pin" className="block text-xs font-semibold text-[#231712] mb-1">
                    Initial Password / PIN *
                  </label>
                  <input
                    id="staff-new-pin"
                    type="text"
                    required
                    minLength={4}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg"
                  />
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-[#E8DFD3] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="px-4 py-2 text-sm font-medium text-[#5C493F] hover:bg-[#FAF8F5] rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-sm font-semibold bg-[#BE1A1A] hover:bg-[#D0311E] text-white rounded-lg cursor-pointer"
              >
                Create User
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 8.3 Edit Name & Phone Modal */}
      {editTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-staff-title"
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleEdit}
            className="bg-white border border-[#E8DFD3] rounded-2xl max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-[#E8DFD3] pb-3">
              <h2 id="edit-staff-title" className="font-display text-lg font-semibold text-[#231712]">
                Edit Staff Details
              </h2>
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                aria-label="Close edit staff modal"
                className="p-1.5 rounded-lg text-[#766257] hover:bg-[#FAF8F5] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label htmlFor="staff-edit-name" className="block text-xs font-semibold text-[#231712] mb-1">
                  Full Name *
                </label>
                <input
                  id="staff-edit-name"
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg"
                />
              </div>

              <div>
                <label htmlFor="staff-edit-phone" className="block text-xs font-semibold text-[#231712] mb-1">
                  Phone Number
                </label>
                <input
                  id="staff-edit-phone"
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg"
                />
              </div>

              <div>
                <label htmlFor="staff-edit-email" className="block text-xs font-semibold text-[#231712] mb-1">
                  Email Address
                </label>
                <input
                  id="staff-edit-email"
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg"
                />
              </div>

              <div>
                <label htmlFor="staff-edit-role" className="block text-xs font-semibold text-[#231712] mb-1">
                  Role
                </label>
                <select
                  id="staff-edit-role"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as StaffRole)}
                  className="w-full px-3 py-2 text-sm bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg"
                >
                  {STAFF_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-3 border-t border-[#E8DFD3] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                className="px-4 py-2 text-sm font-medium text-[#5C493F] hover:bg-[#FAF8F5] rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-sm font-semibold bg-[#BE1A1A] hover:bg-[#D0311E] text-white rounded-lg cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 8.2 Password Reset Modal */}
      {resetTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-pw-title"
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleResetPassword}
            className="bg-white border border-[#E8DFD3] rounded-2xl max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-[#E8DFD3] pb-3">
              <h2 id="reset-pw-title" className="font-display text-lg font-semibold text-[#231712]">
                Reset Password / PIN
              </h2>
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                aria-label="Close password reset modal"
                className="p-1.5 rounded-lg text-[#766257] hover:bg-[#FAF8F5] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#5C493F]">
              Assign a new temporary terminal password or PIN for{' '}
              <span className="font-semibold text-[#231712]">{resetTarget.name}</span>. Their
              account will be flagged for credential rotation across all synced devices.
            </p>

            <div>
              <label htmlFor="staff-reset-pin" className="block text-xs font-semibold text-[#231712] mb-1">
                New Temporary Password / PIN *
              </label>
              <input
                id="staff-reset-pin"
                type="text"
                required
                minLength={4}
                value={resetPin}
                onChange={(e) => setResetPin(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg"
              />
            </div>

            <div className="pt-3 border-t border-[#E8DFD3] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="px-4 py-2 text-sm font-medium text-[#5C493F] hover:bg-[#FAF8F5] rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-sm font-semibold bg-[#BE1A1A] hover:bg-[#D0311E] text-white rounded-lg cursor-pointer"
              >
                Confirm Password Reset
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 8.4 Delete Individual User Confirmation */}
      {deleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-staff-title"
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
        >
          <div className="bg-white border border-[#E8DFD3] rounded-2xl max-w-sm w-full p-6 space-y-4">
            <h2 id="delete-staff-title" className="font-display text-lg font-semibold text-[#231712]">
              Delete Staff User?
            </h2>
            <p className="text-sm text-[#5C493F]">
              Permanently remove <span className="font-semibold text-[#231712]">{deleteTarget.name}</span>{' '}
              ({deleteTarget.role}) from ELA Jewelry POS?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-xs font-medium text-[#5C493F] hover:bg-[#FAF8F5] rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                className="px-4 py-2 text-xs font-semibold bg-[#BE1A1A] hover:bg-[#D0311E] text-white rounded-lg cursor-pointer"
              >
                Delete User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8.5 Remove From All Users Modal */}
      {removeAllOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-all-title"
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleRemoveAllOtherUsers}
            className="bg-white border border-[#E8DFD3] rounded-2xl max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center gap-2 text-[#BE1A1A]">
              <AlertTriangle className="w-5 h-5" aria-hidden="true" />
              <h2 id="remove-all-title" className="font-display text-lg font-semibold text-[#231712]">
                Remove All Other Staff Users
              </h2>
            </div>

            <p className="text-sm text-[#5C493F] leading-relaxed">
              This will immediately revoke access and delete every staff profile except the primary
              Admin owner across all synced devices.
            </p>

            <div>
              <label htmlFor="remove-all-confirm" className="block text-xs font-semibold text-[#231712] mb-1">
                Type <span className="font-mono text-[#BE1A1A]">REMOVE ALL</span> to confirm
              </label>
              <input
                id="remove-all-confirm"
                type="text"
                value={removeConfirmText}
                onChange={(e) => setRemoveConfirmText(e.target.value)}
                placeholder="REMOVE ALL"
                className="w-full px-3 py-2 text-sm font-mono bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRemoveAllOpen(false)}
                className="px-4 py-2 text-xs font-medium text-[#5C493F] hover:bg-[#FAF8F5] rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold bg-[#BE1A1A] hover:bg-[#D0311E] text-white rounded-lg cursor-pointer"
              >
                Remove All Users
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
