import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { API_BASE_URL } from '../../config';
import { toast } from 'sonner';

interface AdminParty {
  _id: string;
  title: string;
  venueName: string;
  startDate: string;
  status: string;
  isFeatured?: boolean;
  totalRevenue?: number;
  organizerPhone?: string;
  createdAt: string;
}

export const AdminPartiesPage: React.FC = () => {
  const navigate = useNavigate();
  const [parties, setParties] = useState<AdminParty[]>([]);
  const [activeTab, setActiveTab] = useState<'pending_review' | 'approved' | 'rejected' | 'cancelled'>('pending_review');
  const [loading, setLoading] = useState(true);

  const fetchParties = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(`${API_BASE_URL}/admin/parties?status=${activeTab}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && data.data?.parties) {
        setParties(data.data.parties);
      }
    } catch {
      toast.error('Failed to load admin parties');
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (localStorage.getItem('isAdminAuthenticated') !== 'true') {
      navigate('/admin/login');
      return;
    }
    fetchParties();
  }, [fetchParties, navigate]);

  const handleApprove = async (id: string) => {
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(`${API_BASE_URL}/admin/parties/${id}/approve`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Party approved and visible to public!');
        fetchParties();
      } else {
        toast.error(data.error || 'Approve failed');
      }
    } catch {
      toast.error('Action failed');
    }
  };

  const handleReject = async (id: string) => {
    const reason = window.prompt('Enter rejection reason:');
    if (reason === null) return;

    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(`${API_BASE_URL}/admin/parties/${id}/reject`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Party rejected');
        fetchParties();
      }
    } catch {
      toast.error('Action failed');
    }
  };

  const handleToggleFeature = async (id: string) => {
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(`${API_BASE_URL}/admin/parties/${id}/feature`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        fetchParties();
      }
    } catch {
      toast.error('Action failed');
    }
  };

  return (
    <div className="min-h-screen bg-[#0d090b] text-white p-6 space-y-6">
      <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold font-serif italic">Admin Party Review Queue</h1>
          <p className="text-xs text-neutral-400">Review one-off event submissions, ticket tiers, and security PINs</p>
        </div>
        <Link to="/admin" className="px-4 py-2 bg-neutral-800 text-xs font-bold rounded-lg hover:bg-neutral-700">
          ← Back to Dashboard
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-neutral-800 pb-2">
        {(['pending_review', 'approved', 'rejected', 'cancelled'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase transition-colors ${
              activeTab === tab ? 'bg-red-600 text-white' : 'bg-neutral-900 text-neutral-400 hover:text-white'
            }`}
          >
            {tab.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-neutral-500 text-xs">Loading parties...</div>
      ) : parties.length > 0 ? (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-black/50 text-neutral-400 border-b border-neutral-800 uppercase text-[10px]">
              <tr>
                <th className="p-4">Submitted</th>
                <th className="p-4">Party Title</th>
                <th className="p-4">Venue</th>
                <th className="p-4">Event Date</th>
                <th className="p-4">Phone</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {parties.map((p) => (
                <tr key={p._id} className="hover:bg-neutral-800/50">
                  <td className="p-4">{new Date(p.createdAt).toLocaleDateString()}</td>
                  <td className="p-4 font-bold text-white flex items-center gap-2">
                    {p.title}
                    {p.isFeatured && <span className="text-[10px] text-amber-400 font-bold">⭐ Featured</span>}
                  </td>
                  <td className="p-4">{p.venueName}</td>
                  <td className="p-4">{new Date(p.startDate).toLocaleString()}</td>
                  <td className="p-4 font-mono">{p.organizerPhone || 'N/A'}</td>
                  <td className="p-4 text-right space-x-2">
                    {p.status === 'pending_review' && (
                      <>
                        <button
                          onClick={() => handleApprove(p._id)}
                          className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg text-[10px]"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleReject(p._id)}
                          className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-[10px]"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {p.status === 'approved' && (
                      <button
                        onClick={() => handleToggleFeature(p._id)}
                        className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-[10px]"
                      >
                        {p.isFeatured ? 'Unfeature' : 'Feature'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-16 text-neutral-500 text-xs italic">No {activeTab.replace('_', ' ')} parties found.</div>
      )}
    </div>
  );
};
export default AdminPartiesPage;
