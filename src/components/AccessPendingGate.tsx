import React, { useState } from 'react';
import { ShieldAlert, Copy, Check, RefreshCw, LogOut } from 'lucide-react';
import { usePos } from '../context/PosContext';

export const AccessPendingGate: React.FC = () => {
  const { user, signOutUser, recheckStoreAccess } = usePos();
  const [copied, setCopied] = useState(false);

  const email = user?.email || '';

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white border border-[#E8DFD3] rounded-2xl p-8 text-center space-y-5">
        <img
          src="/assets/aistudio/image_89dfb75c.png"
          alt="ELA Jewelry"
          className="h-20 mx-auto object-contain"
          referrerPolicy="no-referrer"
        />

        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#FCE8E6] text-[#BE1A1A] mx-auto">
          <ShieldAlert className="w-6 h-6" aria-hidden="true" />
        </div>

        <div>
          <h1 className="font-display text-2xl font-semibold text-[#231712]">
            Store Access Pending
          </h1>
          <p className="text-sm text-[#766257] mt-2 leading-relaxed">
            Your Google account is signed in, but it has not yet been authorized to access the
            shared <span className="font-semibold text-[#231712]">ELA Jewelry</span> database. Ask
            your store Admin to add this email under <span className="font-semibold text-[#231712]">Users &amp; Staff</span>.
          </p>
        </div>

        <div className="bg-[#FAF8F5] border border-[#E8DFD3] rounded-xl px-4 py-3 flex items-center justify-between gap-2">
          <span className="font-mono text-xs text-[#231712] truncate">{email}</span>
          <button
            type="button"
            onClick={copyEmail}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-[#BE1A1A] hover:bg-[#F8EBAB]/40 rounded-md cursor-pointer shrink-0"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
          <button
            type="button"
            onClick={recheckStoreAccess}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#BE1A1A] hover:bg-[#D0311E] text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            <span>Check Access Again</span>
          </button>
          <button
            type="button"
            onClick={signOutUser}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#FAF8F5] hover:bg-[#F8EBAB]/40 border border-[#E8DFD3] text-[#231712] text-sm font-semibold rounded-xl transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
