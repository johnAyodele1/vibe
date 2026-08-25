import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  providerPaidOutFromTransactions: number;
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

const money = (diamonds: number) => `💎 ${formatAmount(diamonds)}`;
const naira = (value: number) => `₦${Math.round(value).toLocaleString()}`;

const Metric = ({ label, value, sub, tone = 'text-amber-500' }: { label: string; value: string; sub: string; tone?: string }) => (
  <div className="bg-[#130d10] border border-red-950/40 rounded-2xl p-5">
    <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{label}</p>
    <p className={`text-2xl font-mono font-bold mt-2 ${tone}`}>{value}</p>
    <p className="text-xs text-neutral-500 mt-1">{sub}</p>
  </div>
);

const AdminAccountingPage: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<Accounting | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (localStorage.getItem('isAdminAuthenticated') !== 'true') {
      navigate('/admin/login');
      return;
    }

    const load = async () => {
      try {
        const token = localStorage.getItem('adminToken');
        const response = await fetch(`${API_BASE_URL}/admin/analytics/accounting`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await response.json();
        if (!response.ok || !json.success) throw new Error(json.error || 'Failed to load accounting data');
        setData(json.accounting);
      } catch (error) {
        console.error(error);
        toast.error('Failed to load accounting dashboard');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [navigate]);

  if (loading) return <div className="min-h-screen bg-[#0d040a] text-white flex items-center justify-center">Loading accounting...</div>;
  if (!data) return <div className="min-h-screen bg-[#0d040a] text-white p-8">Unable to load accounting data.</div>;

  return (
    <main className="min-h-screen bg-[#0d040a] text-white p-6 md:p-8 space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-red-950 pb-6">
        <div>
          <h1 className="text-3xl font-serif italic">Accounting & Reconciliation</h1>
          <p className="text-xs text-neutral-500 mt-1">Operational money movement. Gross, net, payout, refund and reversal views are kept separate.</p>
        </div>
        <div className="flex gap-3">
          <Link to="/admin/analytics" className="px-4 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-xs font-bold">Analytics</Link>
          <Link to="/admin/payouts" className="px-4 py-2 rounded-xl bg-red-950 border border-red-900 text-xs font-bold">Payout Queue</Link>
        </div>
      </header>

      <section>
        <h2 className="text-xs uppercase tracking-widest text-neutral-400 font-bold mb-4">Platform revenue</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Metric label="Gross Platform Fees" value={money(data.grossPlatformFees)} sub={naira(data.grossPlatformFeesNaira)} />
          <Metric label="Reverted Platform Fees" value={money(data.revertedPlatformFees)} sub={naira(data.revertedPlatformFeesNaira)} tone="text-red-400" />
          <Metric label="Net Platform Fees" value={money(data.netPlatformFees)} sub={naira(data.netPlatformFeesNaira)} tone="text-green-400" />
          <Metric label="Completed Purchases" value={money(data.completedPurchaseCredits)} sub={naira(data.completedPurchaseNaira)} tone="text-purple-400" />
        </div>
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-widest text-neutral-400 font-bold mb-4">Provider liability & payouts</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Metric label="Pending Payouts" value={money(data.pendingPayouts)} sub={`${naira(data.pendingPayoutsNaira)} · ${data.pendingPayoutCount} request(s)`} tone="text-amber-400" />
          <Metric label="Completed Payouts" value={money(data.completedPayouts)} sub={naira(data.completedPayoutsNaira)} tone="text-green-400" />
          <Metric label="Rejected Payouts" value={money(data.rejectedPayouts)} sub={naira(data.rejectedPayoutsNaira)} tone="text-red-400" />
          <Metric label="Provider Earnings" value={money(data.providerEarnings)} sub={naira(data.providerEarningsNaira)} tone="text-blue-400" />
        </div>
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-widest text-neutral-400 font-bold mb-4">Money returned / reversed</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Metric label="Customer Refunds" value={money(data.customerRefunded)} sub={`${naira(data.customerRefundedNaira)} · ${data.refundCount} completed`} tone="text-red-400" />
          <Metric label="Provider Reverted" value={money(data.providerReverted)} sub={naira(data.providerRevertedNaira)} tone="text-orange-400" />
          <Metric label="All Reversions" value={money(data.totalReversions)} sub={naira(data.totalReversionsNaira)} tone="text-red-400" />
          <Metric label="Fees Lost to Refunds" value={money(data.revertedPlatformFees)} sub={naira(data.revertedPlatformFeesNaira)} tone="text-orange-400" />
        </div>
      </section>

      <section className="bg-[#130d10] border border-red-950/40 rounded-2xl p-5 text-sm text-neutral-400">
        <p className="font-bold text-white mb-2">Accounting rule</p>
        <p>Pending Payouts is the sum of payout requests in pending, queued, verifying, or processing states. It is not the sum of every provider wallet balance. Platform fees are shown gross, then reduced by completed refund reversals to produce net platform fees.</p>
      </section>
    </main>
  );
};

export default AdminAccountingPage;
