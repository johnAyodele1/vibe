import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { API_BASE_URL } from '../../config';
import { formatAmount } from '../../lib/pricing';

type Accounting = {
  grossPlatformFees: number;
  grossPlatformFeesNaira: number;
  revertedPlatformFees: number;
  revertedPlatformFeesNaira: number;
  netPlatformFees: number;
  netPlatformFeesNaira: number;
  pendingPayouts: number;
  pendingPayoutsNaira: number;
  pendingPayoutCount: number;
  completedPayouts: number;
  completedPayoutsNaira: number;
  rejectedPayouts: number;
  rejectedPayoutsNaira: number;
  providerEarnings: number;
  providerEarningsNaira: number;
  totalReversions: number;
  totalReversionsNaira: number;
  customerRefunded: number;
  customerRefundedNaira: number;
  providerReverted: number;
  providerRevertedNaira: number;
  refundCount: number;
  completedPurchaseCredits: number;
  completedPurchaseNaira: number;
};

const money = (value: number) => `💎 ${formatAmount(value || 0)}`;
const naira = (value: number) => `₦${Math.round(value || 0).toLocaleString()}`;

const Metric = ({
  label,
  value,
  sub,
  tone = 'text-amber-500',
}: {
  label: string;
  value: string;
  sub: string;
  tone?: string;
}) => (
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
        const response = await fetch(`${API_BASE_URL}/admin/analytics/accounting`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await response.json();

        if (!response.ok || !json.success) {
          throw new Error(json.error || 'Failed to load accounting data');
        }

        if (!cancelled) setData(json.accounting);
      } catch (error) {
        console.error('Failed to load accounting analytics:', error);
        if (!cancelled) toast.error('Failed to load accounting analytics');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="space-y-6 border-t border-red-950/60 pt-10">
      <div>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-500">Financial reconciliation</p>
            <h2 className="text-2xl md:text-3xl font-serif italic text-white mt-1">Accounting Overview</h2>
          </div>
          <p className="text-[11px] text-neutral-500 max-w-xl">
            Historical Naira values come from the recorded transaction values. Pending payout liability is based on payout requests, not provider wallet balances.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="bg-[#130d10] border border-red-950/40 rounded-2xl p-8 text-center text-xs text-neutral-500 animate-pulse">
          Loading accounting figures...
        </div>
      ) : !data ? (
        <div className="bg-[#130d10] border border-red-950/40 rounded-2xl p-8 text-center text-xs text-neutral-500">
          Accounting figures are unavailable.
        </div>
      ) : (
        <>
          <div>
            <h3 className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold mb-3">Platform revenue</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Metric label="Gross Platform Fees" value={money(data.grossPlatformFees)} sub={naira(data.grossPlatformFeesNaira)} />
              <Metric label="Reverted Platform Fees" value={money(data.revertedPlatformFees)} sub={naira(data.revertedPlatformFeesNaira)} tone="text-red-400" />
              <Metric label="Net Platform Fees" value={money(data.netPlatformFees)} sub={naira(data.netPlatformFeesNaira)} tone="text-green-400" />
              <Metric label="Fees Lost to Refunds" value={money(data.revertedPlatformFees)} sub={naira(data.revertedPlatformFeesNaira)} tone="text-orange-400" />
            </div>
          </div>

          <div>
            <h3 className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold mb-3">Payout liability & provider money</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Metric label="Pending Payout Liability" value={money(data.pendingPayouts)} sub={`${naira(data.pendingPayoutsNaira)} · ${data.pendingPayoutCount} request(s)`} tone="text-amber-400" />
              <Metric label="Completed Payouts" value={money(data.completedPayouts)} sub={naira(data.completedPayoutsNaira)} tone="text-green-400" />
              <Metric label="Rejected Payouts" value={money(data.rejectedPayouts)} sub={naira(data.rejectedPayoutsNaira)} tone="text-red-400" />
              <Metric label="Total Provider Earnings" value={money(data.providerEarnings)} sub={naira(data.providerEarningsNaira)} tone="text-blue-400" />
            </div>
          </div>

          <div>
            <h3 className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold mb-3">Refunds & reversions</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Metric label="Customer Refunds" value={money(data.customerRefunded)} sub={`${naira(data.customerRefundedNaira)} · ${data.refundCount} refund(s)`} tone="text-red-400" />
              <Metric label="Provider Amount Reverted" value={money(data.providerReverted)} sub={naira(data.providerRevertedNaira)} tone="text-orange-400" />
              <Metric label="Total Reversions" value={money(data.totalReversions)} sub={naira(data.totalReversionsNaira)} tone="text-red-400" />
              <Metric label="Refund Count" value={data.refundCount.toLocaleString()} sub="Completed refunds" tone="text-purple-400" />
            </div>
          </div>

          <div>
            <h3 className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold mb-3">Purchase volume</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Metric label="Completed Purchase Volume" value={money(data.completedPurchaseCredits)} sub={naira(data.completedPurchaseNaira)} tone="text-purple-400" />
              <div className="bg-[#130d10] border border-red-950/40 rounded-2xl p-4 md:p-5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Net reconciliation</p>
                <p className="text-sm md:text-base font-mono font-bold text-white mt-2">
                  Gross fees − reverted fees = net fees
                </p>
                <p className="text-[11px] text-neutral-500 mt-1">
                  {money(data.grossPlatformFees)} − {money(data.revertedPlatformFees)} = {money(data.netPlatformFees)}
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
};

export default AdminAnalyticsAccountingSection;
