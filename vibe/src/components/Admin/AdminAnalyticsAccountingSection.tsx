import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { API_BASE_URL } from '../../config';
import { formatAmount } from '../../lib/pricing';

export type Accounting = {
  // Money Movement
  totalMoneySpentOnPlatform?: number;
  totalMoneySpentOnPlatformNaira?: number;
  completedPurchaseCredits?: number;
  completedPurchaseNaira?: number;
  completedPurchaseCount?: number;
  providerTransactionVolume?: number;
  providerTransactionVolumeNaira?: number;

  // Platform Fee Reconciliation
  expectedPlatformFees?: number;
  expectedPlatformFeesNaira?: number;
  recordedGrossPlatformFees?: number;
  recordedGrossPlatformFeesNaira?: number;
  revertedPlatformFees?: number;
  revertedPlatformFeesNaira?: number;
  currentPlatformEarnings?: number;
  currentPlatformEarningsNaira?: number;
  reconciliationDifference?: number;
  reconciliationDifferenceNaira?: number;

  // Backward compatibility alias keys
  grossPlatformFees?: number;
  grossPlatformFeesNaira?: number;
  netPlatformFees?: number;
  netPlatformFeesNaira?: number;

  // Provider Earnings
  grossProviderEarnings?: number;
  grossProviderEarningsNaira?: number;
  providerAmountReverted?: number;
  providerAmountRevertedNaira?: number;
  providerEarnings?: number;
  providerEarningsNaira?: number;
  netProviderEarnings?: number;
  netProviderEarningsNaira?: number;

  // Payout Liability
  pendingPayouts?: number;
  pendingPayoutsNaira?: number;
  pendingPayoutCount?: number;
  completedPayouts?: number;
  completedPayoutsNaira?: number;
  rejectedPayouts?: number;
  rejectedPayoutsNaira?: number;

  // Refunds & Reversions
  customerRefunded?: number;
  customerRefundedNaira?: number;
  providerReverted?: number;
  providerRevertedNaira?: number;
  platformFeeReverted?: number;
  platformFeeRevertedNaira?: number;
  totalReversions?: number;
  totalReversionsNaira?: number;
  refundCount?: number;
};

const money = (value?: number) => `💎 ${formatAmount(value || 0)}`;
const naira = (value?: number) => `₦${Math.round(value || 0).toLocaleString()}`;

const Metric = ({ label, value, sub, tone = 'text-amber-500' }: { label: string; value: string; sub: string; tone?: string }) => (
  <div className="bg-[#130d10] border border-red-950/40 rounded-2xl p-4 md:p-5">
    <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{label}</p>
    <p className={`text-xl md:text-2xl font-mono font-bold mt-2 ${tone}`}>{value}</p>
    <p className="text-[11px] text-neutral-500 mt-1">{sub}</p>
  </div>
);

const AdminAnalyticsAccountingSection: React.FC = () => {
  const [data, setData] = useState<Accounting | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const token = localStorage.getItem('adminToken');
        const response = await fetch(`${API_BASE_URL}/admin/analytics/accounting`, { headers: { Authorization: `Bearer ${token}` } });
        const json = await response.json();
        if (!response.ok || !json.success) throw new Error(json.error || 'Failed to load accounting data');
        if (!cancelled) setData(json.accounting || {});
      } catch (error) {
        console.error('Failed to load accounting analytics:', error);
        if (!cancelled) toast.error('Failed to load accounting analytics');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="bg-[#130d10] border border-red-950/40 rounded-2xl p-8 text-center text-xs text-neutral-500 animate-pulse">
        Loading accounting figures...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-[#130d10] border border-red-950/40 rounded-2xl p-8 text-center text-xs text-neutral-500">
        Accounting figures are unavailable.
      </div>
    );
  }

  const spentOnPlatform = data.totalMoneySpentOnPlatform ?? 0;
  const spentOnPlatformNaira = data.totalMoneySpentOnPlatformNaira ?? 0;
  const expectedFees = data.expectedPlatformFees ?? 0;
  const expectedFeesNaira = data.expectedPlatformFeesNaira ?? 0;
  const recordedGross = data.recordedGrossPlatformFees ?? data.grossPlatformFees ?? 0;
  const recordedGrossNaira = data.recordedGrossPlatformFeesNaira ?? data.grossPlatformFeesNaira ?? 0;
  const revertedFees = data.revertedPlatformFees ?? 0;
  const revertedFeesNaira = data.revertedPlatformFeesNaira ?? 0;
  const currentEarnings = data.currentPlatformEarnings ?? data.netPlatformFees ?? 0;
  const currentEarningsNaira = data.currentPlatformEarningsNaira ?? data.netPlatformFeesNaira ?? 0;
  const diff = data.reconciliationDifference ?? (recordedGross - expectedFees);
  const diffNaira = data.reconciliationDifferenceNaira ?? (recordedGrossNaira - expectedFeesNaira);

  return (
    <section className="space-y-8 border-t border-red-950/60 pt-10 font-sans">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-500">Financial Ledger & Reconciliation</p>
          <h2 className="text-2xl md:text-3xl font-serif italic text-white mt-1">Admin Accounting</h2>
        </div>
        <p className="text-[11px] text-neutral-500 max-w-xl">
          Historical values are strictly preserved from recorded transactions. Credit purchases, customer platform spending, platform fees, provider earnings, payout liabilities, and reversions are categorized independently.
        </p>
      </div>

      {/* 1. Money Movement */}
      <div>
        <div className="mb-3">
          <h3 className="text-[11px] uppercase tracking-widest text-neutral-300 font-bold">1. Money Movement</h3>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            Credit purchases represent customers acquiring diamonds. Money spent on platform represents diamonds spent on monetized services.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Metric
            label="Total Money Spent on Platform"
            value={money(spentOnPlatform)}
            sub={`${naira(spentOnPlatformNaira)} · Completed service transactions`}
            tone="text-emerald-400"
          />
          <Metric
            label="Credit Purchases"
            value={money(data.completedPurchaseCredits)}
            sub={`${naira(data.completedPurchaseNaira)} · ${(data.completedPurchaseCount ?? 0).toLocaleString()} purchase(s)`}
            tone="text-purple-400"
          />
          <Metric
            label="Provider Transaction Volume"
            value={money(data.providerTransactionVolume ?? spentOnPlatform)}
            sub={`${naira(data.providerTransactionVolumeNaira ?? spentOnPlatformNaira)} · Gross transaction spend`}
            tone="text-amber-400"
          />
        </div>
      </div>

      {/* 2. Platform Fee Reconciliation */}
      <div>
        <div className="mb-3">
          <h3 className="text-[11px] uppercase tracking-widest text-neutral-300 font-bold">2. Platform Fee Reconciliation</h3>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            Reconciles expected platform fees from eligible customer spend against the recorded PlatformEarning ledger.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Metric
            label="Total Money Spent on Platform"
            value={money(spentOnPlatform)}
            sub={naira(spentOnPlatformNaira)}
            tone="text-neutral-200"
          />
          <Metric
            label="Expected Platform Fees (15%)"
            value={money(expectedFees)}
            sub={`${naira(expectedFeesNaira)} · Calculated from eligible spend`}
            tone="text-amber-400"
          />
          <Metric
            label="Recorded Gross Platform Fees"
            value={money(recordedGross)}
            sub={`${naira(recordedGrossNaira)} · PlatformEarning ledger`}
            tone="text-amber-500"
          />
          <Metric
            label="Platform Fees Reverted"
            value={money(revertedFees)}
            sub={`${naira(revertedFeesNaira)} · Refunds / call chargebacks`}
            tone="text-red-400"
          />
          <Metric
            label="Current Platform Earnings"
            value={money(currentEarnings)}
            sub={`${naira(currentEarningsNaira)} · Net signed ledger (Gross - Reverted)`}
            tone="text-green-400"
          />
          <Metric
            label="Reconciliation Difference"
            value={money(diff)}
            sub={`${naira(diffNaira)} · Recorded Gross - Expected`}
            tone={diff === 0 ? 'text-green-400' : 'text-orange-400'}
          />
        </div>
      </div>

      {/* 3. Provider Earnings */}
      <div>
        <div className="mb-3">
          <h3 className="text-[11px] uppercase tracking-widest text-neutral-300 font-bold">3. Provider Earnings</h3>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            Provider earnings based on completed service transactions, less reverted amounts.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Metric
            label="Total Provider Earnings (Gross)"
            value={money(data.grossProviderEarnings)}
            sub={`${naira(data.grossProviderEarningsNaira)} · Completed earnings before reversions`}
            tone="text-blue-400"
          />
          <Metric
            label="Provider Amount Reverted"
            value={money(data.providerAmountReverted)}
            sub={`${naira(data.providerAmountRevertedNaira)} · Reverted provider earnings`}
            tone="text-red-400"
          />
          <Metric
            label="Net Provider Earnings"
            value={money(data.netProviderEarnings ?? data.providerEarnings)}
            sub={`${naira(data.netProviderEarningsNaira ?? data.providerEarningsNaira)} · Gross minus Reverted`}
            tone="text-emerald-400"
          />
        </div>
      </div>

      {/* 4. Payouts */}
      <div>
        <div className="mb-3">
          <h3 className="text-[11px] uppercase tracking-widest text-neutral-300 font-bold">4. Payout Liability & Historical Payouts</h3>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            Pending payout liability reflects active payout requests, excluding rejected requests and provider wallet balances.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Metric
            label="Pending Payout Liability"
            value={money(data.pendingPayouts)}
            sub={`${naira(data.pendingPayoutsNaira)} · ${(data.pendingPayoutCount ?? 0).toLocaleString()} pending request(s)`}
            tone="text-amber-400"
          />
          <Metric
            label="Completed Payouts"
            value={money(data.completedPayouts)}
            sub={`${naira(data.completedPayoutsNaira)} · Historical completed payouts`}
            tone="text-green-400"
          />
          <Metric
            label="Rejected Payouts"
            value={money(data.rejectedPayouts)}
            sub={`${naira(data.rejectedPayoutsNaira)} · Excluded from liability`}
            tone="text-red-400"
          />
        </div>
      </div>

      {/* 5. Refunds & Reversions */}
      <div>
        <div className="mb-3">
          <h3 className="text-[11px] uppercase tracking-widest text-neutral-300 font-bold">5. Refunds & Reversions</h3>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            Breakdown of customer refunds, provider reversals, and platform fee reversals. Reversals are recorded in the signed ledger and not double-counted.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <Metric
            label="Customer Refunds"
            value={money(data.customerRefunded)}
            sub={`${naira(data.customerRefundedNaira)} · Returned to customers`}
            tone="text-red-400"
          />
          <Metric
            label="Provider Amount Reverted"
            value={money(data.providerReverted)}
            sub={`${naira(data.providerRevertedNaira)} · Deducted from provider earnings`}
            tone="text-orange-400"
          />
          <Metric
            label="Platform Fee Reverted"
            value={money(data.platformFeeReverted ?? data.revertedPlatformFees)}
            sub={`${naira(data.platformFeeRevertedNaira ?? data.revertedPlatformFeesNaira)} · Ledger reversal`}
            tone="text-orange-400"
          />
          <Metric
            label="Total Reversions"
            value={money(data.totalReversions)}
            sub={`${naira(data.totalReversionsNaira)} · Combined completed reversions`}
            tone="text-red-400"
          />
          <Metric
            label="Refund Count"
            value={(data.refundCount ?? 0).toLocaleString()}
            sub="Completed customer refund records"
            tone="text-purple-400"
          />
        </div>
      </div>

      <div className="bg-[#130d10] border border-red-950/40 rounded-2xl p-5 text-xs text-neutral-400 space-y-2">
        <p className="font-bold text-white">Accounting Directives Summary</p>
        <p>
          • <strong>Credit Purchases</strong> (diamonds acquired) are kept distinct from <strong>Total Money Spent on Platform</strong> (diamonds spent on monetized services). Credit purchases are not treated as revenue or multiplied by 15%.
        </p>
        <p>
          • <strong>Platform Fee Reconciliation</strong> surfaces expected platform fees against the recorded gross fees, fee reversals, and current net platform earnings.
        </p>
        <p>
          • <strong>Reversals</strong> are logged as negative PlatformEarning entries. Current platform earnings sum the signed ledger directly so reversals are never double-subtracted.
        </p>
      </div>
    </section>
  );
};

export default AdminAnalyticsAccountingSection;
