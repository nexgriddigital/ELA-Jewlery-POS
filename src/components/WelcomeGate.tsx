import React, { useState } from 'react';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  LogIn,
  RefreshCw,
  ArrowLeft,
  User as UserIcon,
  Phone,
  Cloud,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { usePos } from '../context/PosContext';
import { OWNER_ADMIN_EMAIL } from '../types/pos';

type GateMode = 'signin' | 'setup';

export const WelcomeGate: React.FC = () => {
  const {
    signInToTerminal,
    completeFirstTimeStoreSetup,
    refreshCloudConnection,
    signInWithGoogle,
  } = usePos();

  const [mode, setMode] = useState<GateMode>('signin');

  // Sign-In Form State
  const [email, setEmail] = useState('');
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showConsoleHint, setShowConsoleHint] = useState(false);

  // First-Time Store Setup Form State
  const [ownerName, setOwnerName] = useState('Amanuel Hailu');
  const [setupEmail, setSetupEmail] = useState(OWNER_ADMIN_EMAIL);
  const [setupPhone, setSetupPhone] = useState('+251-911-000100');
  const [setupSecret, setSetupSecret] = useState('');
  const [setupConfirmSecret, setSetupConfirmSecret] = useState('');
  const [showSetupSecret, setShowSetupSecret] = useState(false);

  // Refresh Cloud State
  const [refreshingCloud, setRefreshingCloud] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<{ reachable: boolean; detail: string } | null>(
    null
  );

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setShowConsoleHint(false);
    setSubmitting(true);
    try {
      const res = await signInToTerminal(email, secret, keepSignedIn);
      if (!res.ok) {
        setErrorMsg(res.error || 'Invalid staff email or password / 4-digit PIN.');
        if (res.needsEmailPasswordConsoleSetup) {
          setShowConsoleHint(true);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleFirstTimeSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setShowConsoleHint(false);
    if (setupSecret.trim() !== setupConfirmSecret.trim()) {
      setErrorMsg('PIN / Password confirmation does not match.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await completeFirstTimeStoreSetup({
        ownerName,
        email: setupEmail,
        phone: setupPhone,
        secret: setupSecret,
        keepSignedIn,
      });
      if (!res.ok) {
        setErrorMsg(res.error || 'Unable to complete First-Time Store Setup.');
        if (res.needsEmailPasswordConsoleSetup) {
          setShowConsoleHint(true);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefreshCloud = async () => {
    setRefreshingCloud(true);
    try {
      const res = await refreshCloudConnection();
      setCloudStatus(res);
    } finally {
      setRefreshingCloud(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#140D0A] text-[#FAF8F5] flex flex-col justify-between px-4 py-8 sm:px-6 lg:px-10">
      <div className="max-w-md w-full mx-auto my-auto">
        {/* ELA Jewelry Brand Header */}
        <div className="text-center mb-7">
          <div className="inline-flex items-center justify-center bg-white rounded-2xl p-3.5 shadow-lg border border-[#F7D87F]/60">
            <img
              src="/assets/aistudio/image_89dfb75c.png"
              alt="ELA Jewellery and Accessories For Him & Her"
              className="h-24 w-auto object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[#FAF8F5] mt-5 tracking-tight">
            ELA Jewelry Terminal
          </h1>
          <p className="text-xs text-[#C8B9AE] mt-1">
            Shared Boutique POS · Real-Time Multi-Staff Database
          </p>
        </div>

        {/* Main Terminal Auth Card */}
        <div className="bg-[#1C1410] border border-[#3A2A22] rounded-2xl p-6 sm:p-8 shadow-2xl">
          {mode === 'signin' ? (
            <form onSubmit={handleSignIn} className="space-y-5" noValidate>
              {/* Staff Email Address */}
              <div>
                <label
                  htmlFor="terminal-email"
                  className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#F8EBAB] mb-2"
                >
                  Staff Email Address
                </label>
                <div className="relative">
                  <Mail
                    className="w-4 h-4 text-[#9E8B7E] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    id="terminal-email"
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. owner@elajewelry.store"
                    className="w-full pl-10 pr-4 py-3 bg-[#140D0A] border border-[#3E2E26] focus:border-[#F7D87F] rounded-xl text-sm text-[#FAF8F5] placeholder:text-[#7A685D] focus:outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Password or 4-Digit PIN */}
              <div>
                <label
                  htmlFor="terminal-secret"
                  className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#F8EBAB] mb-2"
                >
                  Password or 4-Digit PIN
                </label>
                <div className="relative">
                  <Lock
                    className="w-4 h-4 text-[#9E8B7E] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    id="terminal-secret"
                    type={showSecret ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    placeholder="Enter password or 4-digit PIN..."
                    className="w-full pl-10 pr-11 py-3 bg-[#140D0A] border border-[#3E2E26] focus:border-[#F7D87F] rounded-xl text-sm text-[#FAF8F5] placeholder:text-[#7A685D] focus:outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((prev) => !prev)}
                    aria-label={showSecret ? 'Hide password or PIN' : 'Show password or PIN'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#9E8B7E] hover:text-[#F8EBAB] cursor-pointer transition-colors"
                  >
                    {showSecret ? (
                      <EyeOff className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <Eye className="w-4 h-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
                <p className="font-mono text-[11px] text-[#B8A699] mt-2">
                  Enter your 4-digit Quick Terminal PIN or Account Password
                </p>
              </div>

              {/* Keep Me Signed In */}
              <label className="inline-flex items-center gap-2.5 text-sm text-[#E8DDD4] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={keepSignedIn}
                  onChange={(e) => setKeepSignedIn(e.target.checked)}
                  className="w-4 h-4 rounded border-[#574238] bg-[#140D0A] accent-[#BE1A1A] cursor-pointer"
                />
                <span>Keep me signed in</span>
              </label>

              {/* Inline Error */}
              {errorMsg && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl bg-[#BE1A1A]/15 border border-[#D0311E]/50 px-3.5 py-2.5 text-xs text-[#FFD6D2]"
                >
                  <AlertCircle className="w-4 h-4 text-[#FF8A7E] shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="space-y-1">
                    <p>{errorMsg}</p>
                    {showConsoleHint && (
                      <p className="text-[#F8EBAB]">
                        Demo staff login: <span className="font-mono">{OWNER_ADMIN_EMAIL}</span> / PIN{' '}
                        <span className="font-mono">8800</span> (or sign in with Google below).
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Cloud Ping Feedback */}
              {cloudStatus && (
                <div
                  className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs border ${
                    cloudStatus.reachable
                      ? 'bg-[#143322]/40 border-[#2D6A4F]/50 text-[#B7E4C7]'
                      : 'bg-[#33231C] border-[#F7D87F]/30 text-[#F8EBAB]'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{cloudStatus.detail}</span>
                </div>
              )}

              {/* Primary CTA Button */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2.5 px-5 py-3.5 bg-[#BE1A1A] hover:bg-[#D0311E] disabled:opacity-60 text-white font-semibold text-sm rounded-xl shadow-lg shadow-[#BE1A1A]/20 transition-colors cursor-pointer"
              >
                <LogIn className="w-4 h-4" aria-hidden="true" />
                <span>{submitting ? 'Signing In...' : 'Sign In to Terminal'}</span>
              </button>

              {/* Footer Action Row: First-Time Store Setup & Refresh Cloud */}
              <div className="pt-4 border-t border-[#2E211A] flex items-center justify-between gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setShowConsoleHint(false);
                    setMode('setup');
                  }}
                  className="text-[#E8DDD4] hover:text-[#F7D87F] font-medium transition-colors cursor-pointer"
                >
                  First-Time Store Setup
                </button>

                <button
                  type="button"
                  onClick={handleRefreshCloud}
                  disabled={refreshingCloud}
                  className="inline-flex items-center gap-1.5 text-[#E8DDD4] hover:text-[#F7D87F] font-medium transition-colors cursor-pointer disabled:opacity-60"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${refreshingCloud ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                  <span>{refreshingCloud ? 'Checking...' : 'Refresh Cloud'}</span>
                </button>
              </div>
            </form>
          ) : (
            /* First-Time Store Setup Inline Flow */
            <form onSubmit={handleFirstTimeSetup} className="space-y-4" noValidate>
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#2E211A]">
                <div>
                  <h2 className="text-sm font-semibold text-[#F8EBAB]">First-Time Store Setup</h2>
                  <p className="text-[11px] text-[#B8A699] mt-0.5">
                    Create your ELA Jewelry Owner Admin terminal login
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setMode('signin');
                  }}
                  className="inline-flex items-center gap-1 text-xs text-[#C8B9AE] hover:text-[#F7D87F] cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Back</span>
                </button>
              </div>

              <div>
                <label
                  htmlFor="setup-owner-name"
                  className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#F8EBAB] mb-1.5"
                >
                  Owner Full Name
                </label>
                <div className="relative">
                  <UserIcon
                    className="w-4 h-4 text-[#9E8B7E] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    id="setup-owner-name"
                    type="text"
                    required
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="e.g. Amanuel Hailu"
                    className="w-full pl-10 pr-4 py-2.5 bg-[#140D0A] border border-[#3E2E26] focus:border-[#F7D87F] rounded-xl text-sm text-[#FAF8F5] placeholder:text-[#7A685D] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="setup-email"
                    className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#F8EBAB] mb-1.5"
                  >
                    Admin Email
                  </label>
                  <div className="relative">
                    <Mail
                      className="w-4 h-4 text-[#9E8B7E] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="setup-email"
                      type="email"
                      required
                      value={setupEmail}
                      onChange={(e) => setSetupEmail(e.target.value)}
                      placeholder="owner@elajewelry.store"
                      className="w-full pl-9 pr-3 py-2.5 bg-[#140D0A] border border-[#3E2E26] focus:border-[#F7D87F] rounded-xl text-sm text-[#FAF8F5] placeholder:text-[#7A685D] focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="setup-phone"
                    className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#F8EBAB] mb-1.5"
                  >
                    Phone Number
                  </label>
                  <div className="relative">
                    <Phone
                      className="w-4 h-4 text-[#9E8B7E] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="setup-phone"
                      type="tel"
                      value={setupPhone}
                      onChange={(e) => setSetupPhone(e.target.value)}
                      placeholder="+251-911-000100"
                      className="w-full pl-9 pr-3 py-2.5 bg-[#140D0A] border border-[#3E2E26] focus:border-[#F7D87F] rounded-xl text-sm text-[#FAF8F5] placeholder:text-[#7A685D] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label
                  htmlFor="setup-secret"
                  className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#F8EBAB] mb-1.5"
                >
                  Create Password or 4-Digit PIN
                </label>
                <div className="relative">
                  <Lock
                    className="w-4 h-4 text-[#9E8B7E] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    id="setup-secret"
                    type={showSetupSecret ? 'text' : 'password'}
                    required
                    value={setupSecret}
                    onChange={(e) => setSetupSecret(e.target.value)}
                    placeholder="4-digit PIN (e.g. 8800) or 6+ char password"
                    className="w-full pl-10 pr-11 py-2.5 bg-[#140D0A] border border-[#3E2E26] focus:border-[#F7D87F] rounded-xl text-sm text-[#FAF8F5] placeholder:text-[#7A685D] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSetupSecret((p) => !p)}
                    aria-label={showSetupSecret ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#9E8B7E] hover:text-[#F8EBAB] cursor-pointer"
                  >
                    {showSetupSecret ? (
                      <EyeOff className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <Eye className="w-4 h-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="setup-confirm"
                  className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#F8EBAB] mb-1.5"
                >
                  Confirm Password or 4-Digit PIN
                </label>
                <div className="relative">
                  <Lock
                    className="w-4 h-4 text-[#9E8B7E] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    id="setup-confirm"
                    type={showSetupSecret ? 'text' : 'password'}
                    required
                    value={setupConfirmSecret}
                    onChange={(e) => setSetupConfirmSecret(e.target.value)}
                    placeholder="Re-enter password or 4-digit PIN"
                    className="w-full pl-10 pr-4 py-2.5 bg-[#140D0A] border border-[#3E2E26] focus:border-[#F7D87F] rounded-xl text-sm text-[#FAF8F5] placeholder:text-[#7A685D] focus:outline-none"
                  />
                </div>
              </div>

              {errorMsg && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl bg-[#BE1A1A]/15 border border-[#D0311E]/50 px-3.5 py-2.5 text-xs text-[#FFD6D2]"
                >
                  <AlertCircle className="w-4 h-4 text-[#FF8A7E] shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-[#BE1A1A] hover:bg-[#D0311E] disabled:opacity-60 text-white font-semibold text-sm rounded-xl transition-colors cursor-pointer"
              >
                <LogIn className="w-4 h-4" aria-hidden="true" />
                <span>{submitting ? 'Setting Up Store...' : 'Initialize Owner Account'}</span>
              </button>
            </form>
          )}

          {/* Secondary Google Cloud Sync Option */}
          <div className="mt-5 pt-4 border-t border-[#2E211A]">
            <button
              type="button"
              onClick={signInWithGoogle}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#261B15] hover:bg-[#32241C] border border-[#F7D87F]/30 text-[#F8EBAB] text-xs font-medium rounded-xl transition-colors cursor-pointer"
            >
              <Cloud className="w-3.5 h-3.5 text-[#F7D87F]" aria-hidden="true" />
              <span>Continue with Google Cloud Sync</span>
            </button>
          </div>
        </div>
      </div>

      <footer className="max-w-md w-full mx-auto mt-6 flex items-center justify-between text-[11px] text-[#8E7C70]">
        <span>ELA Jewellery &amp; Accessories</span>
        <span>One Shared Store Database</span>
      </footer>
    </div>
  );
};
