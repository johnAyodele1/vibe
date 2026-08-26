import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { API_BASE_URL, SOCKET_URL } from '../../config';
import { useTipSheetStore, type TipSheetState } from './useTipSheetStore';
import { useWalletStore } from './useWalletStore';
import { usePricingStore, formatAmount } from '../../lib/pricing';

const PRESETS = [10, 25, 50, 100, 250, 500];

export const TipSheet: React.FC = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('adultAccessToken') || '';

  // Select only values
  const isOpen          = useTipSheetStore(s => s.isOpen);
  const provider        = useTipSheetStore(s => s.provider);
  const selectedAmount  = useTipSheetStore(s => s.selectedAmount);
  const customAmount    = useTipSheetStore(s => s.customAmount);
  const message         = useTipSheetStore(s => s.message);
  const step            = useTipSheetStore(s => s.step);
  const result          = useTipSheetStore(s => s.result);

  // Get actions directly from state dynamically
  const closeSheet        = () => useTipSheetStore.getState().closeSheet();
  const setSelectedAmount = (amount: number | null) => useTipSheetStore.getState().setSelectedAmount(amount);
  const setCustomAmount   = (amount: string) => useTipSheetStore.getState().setCustomAmount(amount);
  const setMessage        = (msg: string) => useTipSheetStore.getState().setMessage(msg);
  const setStep           = (s: 'select' | 'processing' | 'success' | 'error') => useTipSheetStore.getState().setStep(s);
  const setResult         = (res: TipSheetState['result']) => useTipSheetStore.getState().setResult(res);
  const reset             = () => useTipSheetStore.getState().reset();

  const creditBalance     = useWalletStore(s => s.creditBalance);
  const fetchWallet       = () => useWalletStore.getState().fetchWallet();
  const setCreditBalance  = (balance: number) => useWalletStore.getState().setCreditBalance(balance);
  const rate              = usePricingStore((state) => state.diamondNairaRate);

  // Local UI states
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [displayedBalance, setDisplayedBalance] = useState(creditBalance);
  const [successCountdown, setSuccessCountdown] = useState(8);
  const [apiError, setApiError] = useState<string | null>(null);

  // Focus custom input when chosen
  const customInputRef = useRef<HTMLInputElement>(null);

  // Sync wallet balance on mount and periodically when open
  useEffect(() => {
    if (isOpen && token) {
      fetchWallet();
    }
  }, [isOpen, token]);

  // Keep displayedBalance updated on change
  useEffect(() => {
    if (step !== 'success') {
      setTimeout(() => setDisplayedBalance(creditBalance), 0);
    }
  }, [creditBalance, step]);

  // Real-time socket listener for balance updates while sheet is open
  useEffect(() => {
    if (!isOpen || !token) return;

    const socketUrl = SOCKET_URL || window.location.origin;
    const socket = io(`${socketUrl}/adult`, {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    socket.on('wallet:updated', (payload: { balance: number }) => {
      useWalletStore.getState().setCreditBalance(payload.balance);
    });

    return () => {
      socket.disconnect();
    };
  }, [isOpen, token]);

  // Countdown timer for auto-close
  useEffect(() => {
    if (step !== 'success') return;
    setTimeout(() => setSuccessCountdown(8), 0);

    const timer = setInterval(() => {
      setSuccessCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          useTipSheetStore.getState().closeSheet();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [step]);

  // Count down animation effect for new balance on success screen
  useEffect(() => {
    if (step === 'success' && result) {
      const start = (result.newBalance as number) + (result.amount as number); // old balance
      const end = result.newBalance as number;
      setTimeout(() => setDisplayedBalance(start), 0);

      let current = start;
      const duration = 800; // 800ms
      const intervalTime = 20; // 20ms
      const steps = duration / intervalTime;
      const stepValue = (start - end) / steps;

      const timer = setInterval(() => {
        current -= stepValue;
        if (current <= end) {
          setDisplayedBalance(end);
          clearInterval(timer);
        } else {
          setDisplayedBalance(Math.round(current));
        }
      }, intervalTime);

      return () => clearInterval(timer);
    }
  }, [step, result]);

  // Swipe gesture for mobile swipe down dismiss
  const touchStartY = useRef<number | null>(null);

  // Escape key close on desktop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        useTipSheetStore.getState().closeSheet();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!isOpen || !provider) return null;

  // Amount computation
  const finalAmount = selectedAmount !== null ? selectedAmount : (parseInt(customAmount) || 0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const currentY = e.touches[0].clientY;
    const diffY = currentY - touchStartY.current;
    if (diffY > 120) {
      closeSheet();
      touchStartY.current = null;
    }
  };

  const handleTouchEnd = () => {
    touchStartY.current = null;
  };

  // Custom chip click handler
  const handleCustomChipClick = () => {
    setSelectedAmount(null);
    setCustomAmount('');
    setShowCustomInput(true);
    setTimeout(() => {
      customInputRef.current?.focus();
    }, 100);
  };

  // Preset chip click handler
  const handlePresetChipClick = (amount: number) => {
    if (amount > creditBalance) return; // Greyed out, unclickable
    setSelectedAmount(amount);
    setCustomAmount('');
    setShowCustomInput(false);
  };

  // Submitting direct tip to backend
  const handleSendTip = async () => {
    if (finalAmount < 1 || finalAmount > 50000 || finalAmount > creditBalance) return;

    setStep('processing');
    setApiError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/v1/adult/wallet/tip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          recipientId: provider.userId,
          amount: finalAmount,
          message: message || undefined,
          context: 'profile_card'
        })
      });

      const data = await response.json();

      if (response.status === 402) {
        setStep('select');
        setApiError('Not enough credits');
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || 'Tip transaction failed');
      }

      // Success
      setResult({
        tipId: data.tipId,
        amount: data.amount,
        newBalance: data.senderNewBalance,
        recipientName: data.recipientName
      });
      // Update local wallet store
      setCreditBalance(data.senderNewBalance);
      setStep('success');

      // Dispatch visual event indicator for ProviderCard success highlight
      window.dispatchEvent(new CustomEvent('tip-success-highlight', { detail: { providerId: provider.userId } }));

    } catch (err: unknown) {
      setStep('select');
      const msg = err instanceof Error ? err.message : 'Network error occurred. Please try again.';
      setApiError(msg);
    }
  };

  // Navigating to PrivateSext private message conversation from success screen
  const handleMessageProvider = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/v1/adult/sext/conversations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ recipientId: provider.userId })
      });
      const data = await response.json();
      if (data.conversationId) {
        closeSheet();
        const isMobile = window.innerWidth < 768;
        if (isMobile) {
          navigate(`/inbox/${data.conversationId}`);
        } else {
          navigate(`/inbox?conversation=${data.conversationId}`);
        }
      }
    } catch {
      setApiError('Could not start conversation.');
    }
  };

  const nairaValue = finalAmount * rate;

  return (
    <div className="fixed inset-0 z-[20000] flex items-end md:items-center justify-center">
      {/* Backdrop */}
      <div
        data-testid="tip-sheet-backdrop"
        onClick={closeSheet}
        className="absolute inset-0 bg-black/70 backdrop-blur-[4px] transition-opacity duration-300"
      />

      {/* Sheet / Modal Container */}
      <div
        data-testid="tip-sheet"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={`relative w-full md:max-w-[420px] bg-[#130d10] border-t md:border border-[var(--az-border)] shadow-[0_-8px_40px_rgba(0,0,0,0.6)] md:shadow-[0_25px_80px_rgba(0,0,0,0.6)] transition-all duration-300 overflow-hidden
          ${step === 'success' ? 'h-auto' : 'h-auto max-h-[85vh]'}
          md:rounded-[24px] rounded-t-[24px] rounded-b-none md:rounded-b-[24px]`}
      >
        {/* Swipe Handle on Mobile */}
        <div className="md:hidden flex justify-center py-3">
          <div className="w-10 h-1 bg-white/15 rounded-full" />
        </div>

        {/* X Close button on Desktop */}
        <button
          onClick={closeSheet}
          className="absolute top-4 right-4 hidden md:flex w-8 h-8 items-center justify-center rounded-full bg-[#1e1014] text-white/60 hover:text-white transition-colors border border-[var(--az-border)]"
        >
          ✕
        </button>

        {step !== 'success' ? (
          /* ======================================================== */
          /* SELECT STATE                                              */
          /* ======================================================== */
          <div className="flex flex-col">
            {/* Header / Title */}
            <div className="px-6 pt-4 pb-2 md:pt-6">
              <h2 className="text-xl md:text-2xl font-serif italic text-[var(--az-text-primary)]">Send a Tip</h2>
              <p className="text-xs text-[var(--az-text-secondary)]">to {provider.stageName}</p>
            </div>

            {/* Divider */}
            <div className="h-[1px] bg-[rgba(200,16,46,0.15)] mx-6 my-2" />

            {/* Provider Info Row */}
            <div className="px-6 py-2 flex items-center gap-3">
              <img
                src={provider.avatarUrl}
                alt={provider.stageName}
                className="w-12 h-12 rounded-full object-cover border-2 border-[var(--az-accent-crimson)]"
              />
              <div>
                <h4 className="font-semibold text-sm text-[var(--az-text-primary)]">{provider.stageName}</h4>
                <p className="text-[10px] uppercase font-bold tracking-wider text-green-500">
                  {provider.isOnline ? '● Online Now' : 'Offline'}
                </p>
              </div>
            </div>

            {/* Balance display */}
            <div className="px-6 py-2 flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-[0.12em] text-[var(--az-text-muted)] uppercase">Your Balance</span>
              <div className="flex items-center gap-1.5" data-testid="wallet-balance">
                <span className="text-yellow-500">💎</span>
                <span className={`font-mono text-sm font-semibold ${creditBalance === 0 ? 'text-red-500' : 'text-yellow-500'}`}>
                  {formatAmount(creditBalance)}
                </span>
                {creditBalance === 0 && (
                  <span
                    onClick={() => { closeSheet(); navigate('/adult/wallet'); }}
                    className="text-[10px] text-yellow-500 underline ml-2 cursor-pointer"
                  >
                    Top Up →
                  </span>
                )}
              </div>
            </div>

            {/* Divider */}
            <div className="h-[1px] bg-[rgba(200,16,46,0.15)] mx-6 my-2" />

            {/* Scrollable Container */}
            <div className="overflow-y-auto px-6 max-h-[40vh] no-scrollbar space-y-4">
              {/* Preset Chips */}
              <div>
                <span className="text-[10px] font-bold tracking-[0.12em] text-[var(--az-text-muted)] uppercase block mb-3">Select Amount</span>
                <div className="grid grid-cols-3 gap-3">
                  {PRESETS.map((amount) => {
                    const isSelected = selectedAmount === amount;
                    const isInsufficient = amount > creditBalance;
                    return (
                      <button
                        key={amount}
                        disabled={isInsufficient}
                        data-amount={amount}
                        onClick={() => handlePresetChipClick(amount)}
                        className={`py-3 rounded-xl border transition-all text-center flex flex-col items-center justify-center gap-1
                          ${isSelected
                            ? 'bg-[rgba(200,16,46,0.12)] border-[var(--az-accent-crimson)] scale-105 shadow-[0_0_0_1px_var(--az-accent-crimson)] text-[var(--az-accent-crimson)]'
                            : 'bg-[#1b1216] border-[var(--az-border)] text-white hover:border-white/20'}
                          ${isInsufficient ? 'opacity-[0.35] cursor-not-allowed border-[var(--az-border)]/50' : ''}`}
                      >
                        <span className="text-yellow-500 text-xs">💎</span>
                        <span className="font-mono text-sm font-bold">{formatAmount(amount)}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Custom Amount Selector Chip */}
                <button
                  onClick={handleCustomChipClick}
                  className={`w-full mt-3 py-3 rounded-xl border border-dashed transition-all text-sm font-serif italic text-[var(--az-text-secondary)]
                    ${showCustomInput
                      ? 'bg-[rgba(200,16,46,0.12)] border-[var(--az-accent-crimson)] scale-105 text-[var(--az-accent-crimson)]'
                      : 'border-[var(--az-border)] bg-[#1b1216] hover:border-white/20'}`}
                >
                  ✏️ Enter custom amount
                </button>
              </div>

              {/* Conditional Custom Amount Input */}
              {showCustomInput && (
                <div className="space-y-2 animate-fadeIn">
                  <div className="bg-[#1b1216] border border-[var(--az-border)] rounded-xl p-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-yellow-500 text-lg">💎</span>
                      <input
                        ref={customInputRef}
                        type="number"
                        placeholder="0"
                        min={1}
                        max={50000}
                        value={customAmount}
                        onChange={(e) => {
                          setSelectedAmount(null);
                          setCustomAmount(e.target.value);
                        }}
                        className="bg-transparent border-none outline-none font-mono text-xl font-semibold text-white w-full"
                      />
                    </div>
                    {finalAmount > 0 && (
                      <span className="text-xs text-[var(--az-text-muted)] font-mono">
                        ≈ ₦{nairaValue.toLocaleString('en-NG')}
                      </span>
                    )}
                  </div>

                  {/* Inline Error Validation */}
                  {finalAmount < 1 && customAmount !== '' && (
                    <p className="text-xs text-[var(--az-accent-rose)] font-serif italic">Minimum tip is 💎 1</p>
                  )}
                  {finalAmount > 50000 && (
                    <p className="text-xs text-[var(--az-accent-rose)] font-serif italic">Maximum tip is 💎 50,000</p>
                  )}
                  {finalAmount > creditBalance && (
                    <p className="text-xs text-[var(--az-accent-rose)] font-serif italic flex items-center gap-2">
                      <span>Not enough credits</span>
                      <span
                        onClick={() => { closeSheet(); navigate('/adult/wallet'); }}
                        className="text-yellow-500 underline font-serif font-bold cursor-pointer"
                      >
                        Top Up →
                      </span>
                    </p>
                  )}
                </div>
              )}

              {/* Optional message input */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold tracking-[0.12em] text-[var(--az-text-muted)] uppercase">Add a message (optional)</span>
                <div className="relative">
                  <textarea
                    rows={2}
                    maxLength={150}
                    placeholder="Say something nice... (optional)"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full bg-[#1b1216] border border-[var(--az-border)] rounded-xl p-3 text-sm text-white outline-none resize-none focus:border-[rgba(200,16,46,0.4)]"
                  />
                  {message.length > 0 && (
                    <span className="absolute bottom-2 right-3 text-[10px] text-[var(--az-text-muted)]">
                      {message.length} / 150
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Error Message */}
            {(apiError || apiError === 'Not enough credits') && (
              <div className="px-6 pt-3">
                <p className="text-xs text-[var(--az-accent-rose)] font-serif italic text-center">
                  {apiError === 'Not enough credits' ? 'Not enough credits' : apiError}
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="p-6 flex flex-col gap-3">
              <button
                onClick={handleSendTip}
                disabled={step === 'processing' || finalAmount < 1 || finalAmount > 50000 || finalAmount > creditBalance}
                className={`w-full py-4 rounded-xl text-base font-semibold transition-all duration-200 tracking-wide flex items-center justify-center gap-2
                  ${step === 'processing'
                    ? 'bg-[var(--az-accent-crimson)]/80 text-white cursor-not-allowed'
                    : finalAmount >= 1 && finalAmount <= 50000 && finalAmount <= creditBalance
                      ? 'bg-[var(--az-accent-crimson)] text-white hover:brightness-110 active:scale-[0.98] shadow-[0_4_24_rgba(200,16,46,0.35)]'
                      : 'bg-[#1b1216] text-[var(--az-text-muted)] cursor-not-allowed'}`}
              >
                {step === 'processing' ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Processing...</span>
                  </>
                ) : finalAmount > 0 && finalAmount <= creditBalance ? (
                  `Send 💎 ${formatAmount(finalAmount)} to ${provider.stageName}`
                ) : (
                  'Send Tip'
                )}
              </button>

              <span className="text-[10px] text-[var(--az-text-muted)] text-center block mb-4">
                🔒 Secure transaction · Credits deducted instantly
              </span>
            </div>
          </div>
        ) : (
          /* ======================================================== */
          /* SUCCESS STATE                                             */
          /* ======================================================== */
          <div className="flex flex-col items-center justify-center p-8 text-center gap-5 relative animate-scaleUp">
            {/* Success ring indicator */}
            <div className="relative w-20 h-20 flex items-center justify-center bg-green-500/10 rounded-full border border-green-500 shadow-[0_0_0_8px_rgba(34,197,94,0.08),_0_0_0_16px_rgba(34,197,94,0.04)] animate-[bounce_1s_ease-in-out_1]">
              <span className="text-3xl text-green-500">✓</span>
            </div>

            {/* Typography */}
            <div className="space-y-1">
              <h2 className="text-2xl md:text-3xl font-serif italic text-white leading-tight">Tip Sent! 🎉</h2>
              <p className="text-sm text-[var(--az-text-secondary)] font-medium">
                <span className="text-yellow-500">💎 {formatAmount(result?.amount as number)}</span> sent to {String(result?.recipientName || '')}
              </p>
              <p className="text-xs text-[var(--az-text-muted)]">Your tip is on its way</p>
            </div>

            {/* In-flight moving progress line */}
            <div className="relative w-40 h-[2px] bg-white/10 rounded-full overflow-hidden mx-auto my-1">
              <div className="absolute top-0 h-full w-20 bg-gradient-to-r from-transparent via-green-500 to-transparent animate-slideLine" />
            </div>

            {/* New balance countdown display */}
            <div className="space-y-1 my-2">
              <span className="text-[10px] font-bold tracking-[0.12em] text-[var(--az-text-muted)] uppercase block">Your New Balance</span>
              <div className="flex items-center justify-center gap-1.5 text-yellow-500">
                <span className="text-lg">💎</span>
                <span className="font-mono text-xl font-bold">
                  {formatAmount(displayedBalance)}
                </span>
              </div>
            </div>

            {/* Divider */}
            <div className="w-[40%] h-[1px] bg-[rgba(200,16,46,0.15)] mx-auto my-1" />

            {/* Stacked Vertical action buttons */}
            <div className="w-full flex flex-col gap-3.5 pt-2">
              <button
                onClick={reset}
                className="w-full py-3 rounded-xl border border-[var(--az-accent-crimson)] text-[var(--az-accent-crimson)] font-semibold text-sm hover:bg-[var(--az-accent-crimson)] hover:text-white transition-colors"
              >
                Send Another Tip
              </button>

              <button
                onClick={handleMessageProvider}
                className="text-pink-400 hover:text-pink-300 font-serif italic text-sm tracking-wide transition-colors"
              >
                Message {provider.stageName}
              </button>

              <button
                onClick={closeSheet}
                className="text-[var(--az-text-muted)] hover:text-white text-xs transition-colors"
              >
                Done
              </button>
            </div>

            {/* Countdown timer progress bar at bottom */}
            <div className="absolute bottom-0 left-0 w-full h-1 bg-white/5">
              <div
                className="h-full bg-[var(--az-accent-crimson)] transition-all linear duration-1000"
                style={{ width: `${(successCountdown / 8) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
