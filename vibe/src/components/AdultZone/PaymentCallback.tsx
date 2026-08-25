import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { API_BASE_URL } from '../../config';
import { useAdultAuth } from '../../contexts/AdultAuthContext';
import { formatAmount, formatNaira } from '../../lib/pricing';

export const PaymentCallback: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refetchUser, updateCredits } = useAdultAuth();

  const reference = searchParams.get('reference') || searchParams.get('trxref') || '';
  const token = localStorage.getItem('adultAccessToken') || '';

  const [status, setStatus] = useState<'pending' | 'success' | 'failed'>('pending');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [details, setDetails] = useState<{ diamonds: number; amountNaira: number } | null>(null);

  const [retryCount, setRetryCount] = useState(0);

  const verifyPayment = async (isMounted = true) => {
    if (!reference) {
      if (isMounted) {
        setStatus('failed');
        setErrorMessage('No payment reference found.');
      }
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/wallet/paystack/verify/${encodeURIComponent(reference)}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await res.json();

      if (!isMounted) return;

      if (res.ok && data.success && data.status === 'completed') {
        setStatus('success');
        setDetails({
          diamonds: data.diamonds || 0,
          amountNaira: data.amountNaira || 0,
        });
        if (refetchUser) await refetchUser();
        if (typeof data.creditBalance === 'number' && updateCredits) {
          updateCredits(data.creditBalance);
        }
      } else if (data.status === 'pending') {
        setStatus('pending');
        if (retryCount < 4) {
          const delay = Math.min(10000, 2000 * Math.pow(1.5, retryCount));
          setTimeout(() => {
            if (isMounted) {
              setRetryCount((prev) => prev + 1);
            }
          }, delay);
        }
      } else {
        setStatus('failed');
        setErrorMessage(data.error || 'Your payment could not be completed.');
        if (data.amountNaira) {
          setDetails({
            diamonds: data.diamonds || 0,
            amountNaira: data.amountNaira || 0,
          });
        }
      }
    } catch (err: unknown) {
      if (!isMounted) return;
      setStatus('failed');
      const msg = err instanceof Error ? err.message : 'Verification request failed.';
      setErrorMessage(msg);
    }
  };

  useEffect(() => {
    let isMounted = true;
    Promise.resolve().then(() => {
      void verifyPayment(isMounted);
    });
    return () => {
      isMounted = false;
    };
  }, [reference, token, retryCount]);

  const handleDone = () => {
    navigate('/wallet');
  };

  const handleTryAgain = () => {
    navigate('/wallet');
  };

  return (
    <div className="fixed inset-0 z-[20000] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        onClick={handleDone}
        className="absolute inset-0 bg-black/70 backdrop-blur-[4px] transition-opacity duration-300"
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-[420px] bg-[#130d10] border border-[var(--az-border)] shadow-[0_25px_80px_rgba(0,0,0,0.6)] rounded-[24px] overflow-hidden p-8 text-center animate-scaleUp">
        {status === 'pending' && (
          <div className="flex flex-col items-center justify-center gap-5">
            <div className="w-16 h-16 flex items-center justify-center bg-yellow-500/10 rounded-full border border-yellow-500/30">
              <svg className="animate-spin h-8 w-8 text-yellow-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
            <div className="space-y-1">
              <h2 className="text-2xl font-serif italic text-white">Confirming Payment</h2>
              <p className="text-sm text-[var(--az-text-secondary)]">We're confirming your payment with Paystack.</p>
              <p className="text-xs text-[var(--az-text-muted)] mt-2">Your wallet will be updated once the payment is verified.</p>
            </div>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center justify-center gap-5">
            <div className="w-20 h-20 flex items-center justify-center bg-green-500/10 rounded-full border border-green-500 shadow-[0_0_0_8px_rgba(34,197,94,0.08),_0_0_0_16px_rgba(34,197,94,0.04)] animate-[bounce_1s_ease-in-out_1]">
              <span className="text-3xl text-green-500">✓</span>
            </div>

            <div className="space-y-1">
              <h2 className="text-2xl md:text-3xl font-serif italic text-white">Payment Successful 🎉</h2>
              <p className="text-2xl font-mono font-bold text-yellow-500 mt-2">
                +💎 {formatAmount(details?.diamonds || 0)}
              </p>
              {details?.amountNaira ? (
                <p className="text-sm text-[var(--az-text-muted)] font-mono">
                  {formatNaira(details.amountNaira)}
                </p>
              ) : null}
              <p className="text-sm text-[var(--az-text-secondary)] font-medium pt-2">
                Your wallet has been credited.
              </p>
            </div>

            <div className="w-full pt-4">
              <button
                onClick={handleDone}
                className="w-full py-4 rounded-xl text-base font-semibold bg-[var(--az-accent-crimson)] text-white hover:brightness-110 active:scale-[0.98] transition-all shadow-[0_4_24_rgba(200,16,46,0.35)]"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {status === 'failed' && (
          <div className="flex flex-col items-center justify-center gap-5">
            <div className="w-20 h-20 flex items-center justify-center bg-red-500/10 rounded-full border border-red-500/50 shadow-[0_0_0_8px_rgba(239,68,68,0.08)]">
              <span className="text-3xl text-red-500">✕</span>
            </div>

            <div className="space-y-1">
              <h2 className="text-2xl md:text-3xl font-serif italic text-white">Payment Unsuccessful</h2>
              <p className="text-sm text-[var(--az-text-secondary)] font-medium mt-1">
                {errorMessage || 'Your payment could not be completed.'}
              </p>
              {details?.amountNaira ? (
                <p className="text-sm text-[var(--az-text-muted)] font-mono mt-1">
                  {formatNaira(details.amountNaira)}
                </p>
              ) : null}
              <p className="text-xs text-[var(--az-accent-rose)] font-serif italic pt-2">
                No diamonds were added to your wallet.
              </p>
            </div>

            <div className="w-full flex flex-col gap-3 pt-4">
              <button
                onClick={handleTryAgain}
                className="w-full py-4 rounded-xl text-base font-semibold bg-[var(--az-accent-crimson)] text-white hover:brightness-110 active:scale-[0.98] transition-all shadow-[0_4_24_rgba(200,16,46,0.35)]"
              >
                Try Again
              </button>
              <button
                onClick={handleDone}
                className="w-full py-3 rounded-xl border border-[var(--az-border)] text-[var(--az-text-secondary)] font-semibold text-sm hover:text-white transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentCallback;
