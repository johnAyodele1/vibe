import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { API_BASE_URL } from '../../config';
import { toast } from 'sonner';

interface AdminClub {
  _id: string;
  name: string;
  description?: string;
  location?: { city?: string; address?: string };
  status: 'pending' | 'active' | 'suspended' | 'rejected';
  createdAt: string;
  rejectionReason?: string;
}

export const AdminClubsPage: React.FC = () => {
  const navigate = useNavigate();
  const [clubs, setClubs] = useState<AdminClub[]>([]);
  const [activeTab, setActiveTab] = useState<'pending' | 'active' | 'rejected' | 'suspended'>('pending');
  const [loading, setLoading] = useState(true);

  const fetchClubs = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(`${API_BASE_URL}/admin/clubs?status=${activeTab}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && data.data?.clubs) {
        setClubs(data.data.clubs);
      }
    } catch {
      toast.error('Failed to load admin clubs');
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (localStorage.getItem('isAdminAuthenticated') !== 'true') {
      navigate('/admin/login');
      return;
    }
    fetchClubs();
  }, [fetchClubs, navigate]);

  const handleApprove = async (id: string) => {
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(`${API_BASE_URL}/admin/clubs/${id}/approve`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Club approved successfully!');
        fetchClubs();
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
      const res = await fetch(`${API_BASE_URL}/admin/clubs/${id}/reject`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Club rejected');
        fetchClubs();
      }
    } catch {
      toast.error('Action failed');
    }
  };

  const handleSuspend = async (id: string) => {
    if (!window.confirm('Suspend this active club?')) return;
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(`${API_BASE_URL}/admin/clubs/${id}/suspend`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Club suspended');
        fetchClubs();
      }
    } catch {
      toast.error('Action failed');
    }
  };

  return (
    <div className="min-h-screen bg-[#0d090b] text-white p-6 space-y-6">
      <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold font-serif italic">Admin Clubs Verification</h1>
          <p className="text-xs text-neutral-400">Review venue submissions and manage active club listings</p>
        </div>
        <Link to="/admin" className="px-4 py-2 bg-neutral-800 text-xs font-bold rounded-lg hover:bg-neutral-700">
          ← Back to Dashboard
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-neutral-800 pb-2">
        {(['pending', 'active', 'rejected', 'suspended'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase transition-colors ${
              activeTab === tab ? 'bg-red-600 text-white' : 'bg-neutral-900 text-neutral-400 hover:text-white'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-neutral-500 text-xs">Loading clubs...</div>
      ) : clubs.length > 0 ? (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-black/50 text-neutral-400 border-b border-neutral-800 uppercase text-[10px]">
              <tr>
                <th className="p-4">Date</th>
                <th className="p-4">Club Name</th>
                <th className="p-4">Location</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {clubs.map((c) => (
                <tr key={c._id} className="hover:bg-neutral-800/50">
                  <td className="p-4">{new Date(c.createdAt).toLocaleDateString()}</td>
                  <td className="p-4 font-bold text-white">{c.name}</td>
                  <td className="p-4">{c.location?.city || 'Lagos'}, {c.location?.address}</td>
                  <td className="p-4">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-neutral-800 text-neutral-300">
                      {c.status}
                    </span>
                  </td>
                  <td className="p-4 text-right space-x-2">
                    {c.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleApprove(c._id)}
                          className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg text-[10px]"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleReject(c._id)}
                          className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-[10px]"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {c.status === 'active' && (
                      <button
                        onClick={() => handleSuspend(c._id)}
                        className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-[10px]"
                      >
                        Suspend
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-16 text-neutral-500 text-xs italic">No {activeTab} clubs found.</div>
      )}
    </div>
  );
};
export default AdminClubsPage;
