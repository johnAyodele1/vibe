import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import styles from './Admin.module.css';
import { API_BASE_URL } from '../../config';

interface AdvertisementItem {
  id: string;
  title: string;
  description?: string;
  mediaType: 'image' | 'video';
  mediaUrl: string;
  thumbnailUrl?: string | null;
  clickUrl?: string | null;
  targetAudience: 'user' | 'provider' | 'both';
  status: 'draft' | 'scheduled' | 'active' | 'paused' | 'expired';
  effectiveStatus?: string;
  campaignStartsAt: string;
  campaignEndsAt: string;
  displayDurationSeconds: number;
  closeAfterSeconds: number;
  createdAt: string;
}

export const AdminAdvertisementsPage: React.FC = () => {
  const navigate = useNavigate();
  const [ads, setAds] = useState<AdvertisementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingAd, setEditingAd] = useState<AdvertisementItem | null>(null);

  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [mediaUrl, setMediaUrl] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [clickUrl, setClickUrl] = useState('');
  const [targetAudience, setTargetAudience] = useState<'user' | 'provider' | 'both'>('both');
  const [status, setStatus] = useState<'draft' | 'scheduled' | 'active' | 'paused' | 'expired'>('active');
  const [campaignStartsAt, setCampaignStartsAt] = useState('');
  const [campaignEndsAt, setCampaignEndsAt] = useState('');
  const [displayDurationSeconds, setDisplayDurationSeconds] = useState(30);
  const [closeAfterSeconds, setCloseAfterSeconds] = useState(15);

  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchAds = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('adminToken');
      const res = await fetch(`${API_BASE_URL}/admin/ads?page=${page}&limit=20`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setAds(data.data.advertisements);
        setTotalPages(data.data.pagination.totalPages);
      } else {
        toast.error(data.message || 'Failed to fetch advertisements');
      }
    } catch (err) {
      console.error('Error fetching ads:', err);
      toast.error('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    if (localStorage.getItem('isAdminAuthenticated') !== 'true') {
      navigate('/admin/login');
      return;
    }
    fetchAds();
  }, [fetchAds, navigate]);

  const openCreateModal = () => {
    setEditingAd(null);
    setTitle('');
    setDescription('');
    setMediaType('image');
    setMediaUrl('');
    setThumbnailUrl('');
    setClickUrl('');
    setTargetAudience('both');
    setStatus('active');

    const now = new Date();
    const twoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    setCampaignStartsAt(now.toISOString().slice(0, 16));
    setCampaignEndsAt(twoWeeks.toISOString().slice(0, 16));
    setDisplayDurationSeconds(30);
    setCloseAfterSeconds(15);

    setShowModal(true);
  };

  const openEditModal = (ad: AdvertisementItem) => {
    setEditingAd(ad);
    setTitle(ad.title);
    setDescription(ad.description || '');
    setMediaType(ad.mediaType);
    setMediaUrl(ad.mediaUrl);
    setThumbnailUrl(ad.thumbnailUrl || '');
    setClickUrl(ad.clickUrl || '');
    setTargetAudience(ad.targetAudience);
    setStatus(ad.status);
    setCampaignStartsAt(new Date(ad.campaignStartsAt).toISOString().slice(0, 16));
    setCampaignEndsAt(new Date(ad.campaignEndsAt).toISOString().slice(0, 16));
    setDisplayDurationSeconds(ad.displayDurationSeconds);
    setCloseAfterSeconds(ad.closeAfterSeconds);

    setShowModal(true);
  };

  const handleMediaFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const token = localStorage.getItem('adminToken');
    setUploadingMedia(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_BASE_URL}/admin/ads/upload-media`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        setMediaUrl(data.data.mediaUrl);
        setMediaType(data.data.mediaType);
        toast.success('Ad media uploaded successfully!');
      } else {
        toast.error(data.message || 'Media upload failed');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to upload media file');
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleSaveAd = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }

    if (!mediaUrl.trim()) {
      toast.error('Media URL or file is required');
      return;
    }

    const start = new Date(campaignStartsAt);
    const end = new Date(campaignEndsAt);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      toast.error('Invalid start or end date');
      return;
    }

    if (start >= end) {
      toast.error('Campaign start date must be before campaign end date');
      return;
    }

    if (displayDurationSeconds <= 0) {
      toast.error('Display duration must be greater than 0');
      return;
    }

    if (closeAfterSeconds <= 0 || closeAfterSeconds > displayDurationSeconds) {
      toast.error('Close delay must be between 1 second and the display duration');
      return;
    }

    setSaving(true);
    const token = localStorage.getItem('adminToken');

    const payload = {
      title,
      description,
      mediaType,
      mediaUrl,
      thumbnailUrl: thumbnailUrl.trim() || undefined,
      clickUrl: clickUrl.trim() || undefined,
      targetAudience,
      status,
      campaignStartsAt: start.toISOString(),
      campaignEndsAt: end.toISOString(),
      displayDurationSeconds: Number(displayDurationSeconds),
      closeAfterSeconds: Number(closeAfterSeconds),
    };

    try {
      const url = editingAd
        ? `${API_BASE_URL}/admin/ads/${editingAd.id}`
        : `${API_BASE_URL}/admin/ads`;
      const method = editingAd ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(editingAd ? 'Advertisement updated!' : 'Advertisement created!');
        setShowModal(false);
        fetchAds();
      } else {
        toast.error(data.message || 'Failed to save advertisement');
      }
    } catch (err) {
      toast.error('Error saving advertisement');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (adId: string, newStatus: string) => {
    const token = localStorage.getItem('adminToken');
    try {
      const res = await fetch(`${API_BASE_URL}/admin/ads/${adId}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(`Status updated to ${newStatus}`);
        fetchAds();
      } else {
        toast.error(data.message || 'Failed to update status');
      }
    } catch {
      toast.error('Action failed');
    }
  };

  const handleDeleteAd = async (adId: string) => {
    if (!window.confirm('Are you sure you want to delete this advertisement?')) return;

    const token = localStorage.getItem('adminToken');
    try {
      const res = await fetch(`${API_BASE_URL}/admin/ads/${adId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (data.success) {
        toast.success('Advertisement deleted');
        fetchAds();
      } else {
        toast.error(data.message || 'Failed to delete advertisement');
      }
    } catch {
      toast.error('Deletion failed');
    }
  };

  return (
    <div className={styles.dashboardContainer}>
      <header className={styles.dashboardHeader}>
        <h1>📢 In-Chat Advertisements</h1>
        <div className="flex items-center gap-3">
          <Link
            to="/admin"
            style={{
              backgroundColor: '#1f2937',
              color: 'white',
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 'bold',
              textDecoration: 'none',
            }}
          >
            ← Dashboard
          </Link>
          <button
            onClick={openCreateModal}
            style={{
              backgroundColor: '#f42559',
              color: 'white',
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 'bold',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            + Create Advertisement
          </button>
        </div>
      </header>

      <div className={styles.section}>
        <h2>All Campaigns</h2>

        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading advertisements...</div>
        ) : ads.length === 0 ? (
          <div className="p-8 text-center text-gray-400 bg-neutral-900 rounded-xl border border-neutral-800 my-4">
            No advertisements created yet. Click <strong>+ Create Advertisement</strong> to launch a campaign.
          </div>
        ) : (
          <div className={styles.tableContainer}>
            <table>
              <thead>
                <tr>
                  <th>Preview</th>
                  <th>Title & Info</th>
                  <th>Target Audience</th>
                  <th>Campaign Window</th>
                  <th>Display Duration</th>
                  <th>Close Delay</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {ads.map((ad) => (
                  <tr key={ad.id}>
                    <td style={{ width: '80px' }}>
                      {ad.mediaType === 'video' ? (
                        <video
                          src={ad.mediaUrl}
                          style={{ width: '60px', height: '45px', objectFit: 'cover', borderRadius: '6px' }}
                          muted
                        />
                      ) : (
                        <img
                          src={ad.mediaUrl}
                          alt={ad.title}
                          style={{ width: '60px', height: '45px', objectFit: 'cover', borderRadius: '6px' }}
                        />
                      )}
                    </td>
                    <td>
                      <div className="font-bold text-white text-sm">{ad.title}</div>
                      {ad.clickUrl && (
                        <a
                          href={ad.clickUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-pink-400 hover:underline block truncate max-w-[200px]"
                        >
                          🔗 {ad.clickUrl}
                        </a>
                      )}
                    </td>
                    <td>
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-neutral-800 text-neutral-300">
                        {ad.targetAudience}
                      </span>
                    </td>
                    <td className="text-xs text-neutral-300">
                      <div>{new Date(ad.campaignStartsAt).toLocaleDateString()}</div>
                      <div className="text-neutral-500">to {new Date(ad.campaignEndsAt).toLocaleDateString()}</div>
                    </td>
                    <td className="font-mono text-xs text-neutral-300">
                      ⏱ {ad.displayDurationSeconds}s
                    </td>
                    <td className="font-mono text-xs text-neutral-300">
                      🔒 {ad.closeAfterSeconds}s
                    </td>
                    <td>
                      <span
                        className={`${styles.badge} ${
                          ad.status === 'active'
                            ? styles.activeBadge
                            : ad.status === 'paused'
                            ? styles.pendingBadge
                            : styles.inactiveBadge
                        }`}
                      >
                        {ad.effectiveStatus || ad.status}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <button
                          className={`${styles.actionBtn} ${styles.blockBtn}`}
                          onClick={() => openEditModal(ad)}
                        >
                          Edit
                        </button>

                        {ad.status === 'active' ? (
                          <button
                            className={`${styles.actionBtn} ${styles.blockBtn}`}
                            onClick={() => handleStatusChange(ad.id, 'paused')}
                          >
                            Pause
                          </button>
                        ) : (
                          <button
                            className={`${styles.actionBtn} ${styles.blockBtn}`}
                            onClick={() => handleStatusChange(ad.id, 'active')}
                          >
                            Activate
                          </button>
                        )}

                        <button
                          className={`${styles.actionBtn} ${styles.deleteBtn}`}
                          onClick={() => handleDeleteAd(ad.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-4">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 bg-neutral-800 text-white rounded disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-neutral-400 py-1">
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 bg-neutral-800 text-white rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* CREATE / EDIT MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 max-w-xl w-full text-white space-y-4 my-8">
            <div className="flex justify-between items-center border-b border-neutral-800 pb-3">
              <h3 className="text-lg font-bold">
                {editingAd ? 'Edit Advertisement' : 'Create Advertisement'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-neutral-400 hover:text-white text-xl"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSaveAd} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-neutral-400 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="E.g., Weekend Promotion Special"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-sm outline-none focus:border-pink-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-neutral-400 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional brief description of the offer..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-sm outline-none focus:border-pink-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-neutral-400 mb-1">
                    Media Type
                  </label>
                  <select
                    value={mediaType}
                    onChange={(e) => setMediaType(e.target.value as 'image' | 'video')}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-sm outline-none focus:border-pink-500"
                  >
                    <option value="image">Image (JPEG, PNG, WEBP)</option>
                    <option value="video">Video (MP4, WEBM)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-neutral-400 mb-1">
                    Target Audience
                  </label>
                  <select
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value as 'user' | 'provider' | 'both')}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-sm outline-none focus:border-pink-500"
                  >
                    <option value="both">Both (Users & Providers)</option>
                    <option value="user">Users Only</option>
                    <option value="provider">Providers Only</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-neutral-400 mb-1">
                  Media File / URL
                </label>
                <div className="space-y-2">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                    onChange={handleMediaFileUpload}
                    className="block w-full text-xs text-neutral-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-neutral-800 file:text-white hover:file:bg-neutral-700 cursor-pointer"
                  />
                  {uploadingMedia && (
                    <p className="text-xs text-amber-500 animate-pulse">Uploading file to media server...</p>
                  )}
                  <input
                    type="url"
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                    placeholder="Or enter direct media URL (https://...)"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-sm outline-none focus:border-pink-500"
                  />
                </div>
              </div>

              {mediaUrl && (
                <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl">
                  <span className="text-[10px] uppercase font-bold text-neutral-400 block mb-2">Media Preview</span>
                  {mediaType === 'video' ? (
                    <video src={mediaUrl} controls className="max-h-40 rounded mx-auto" />
                  ) : (
                    <img src={mediaUrl} alt="Preview" className="max-h-40 rounded mx-auto object-contain" />
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase text-neutral-400 mb-1">
                  Destination URL (CTA Link)
                </label>
                <input
                  type="url"
                  value={clickUrl}
                  onChange={(e) => setClickUrl(e.target.value)}
                  placeholder="https://example.com/special-offer"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-sm outline-none focus:border-pink-500"
                />
              </div>

              <div className="p-3 bg-neutral-950/60 border border-neutral-800 rounded-xl space-y-3">
                <span className="text-xs font-bold text-pink-400 block uppercase tracking-wider">
                  ⏱ Timing & Duration Configuration
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-neutral-400 mb-1">
                      Campaign Start Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      required
                      value={campaignStartsAt}
                      onChange={(e) => setCampaignStartsAt(e.target.value)}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2 text-xs outline-none text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-neutral-400 mb-1">
                      Campaign End Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      required
                      value={campaignEndsAt}
                      onChange={(e) => setCampaignEndsAt(e.target.value)}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2 text-xs outline-none text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-neutral-400 mb-1">
                      Display Duration (Seconds)
                    </label>
                    <input
                      type="number"
                      min={1}
                      required
                      value={displayDurationSeconds}
                      onChange={(e) => setDisplayDurationSeconds(parseInt(e.target.value, 10) || 30)}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2 text-xs outline-none text-white font-mono"
                    />
                    <span className="text-[10px] text-neutral-500 block mt-1">
                      How long this ad remains visible in chat before auto-closing.
                    </span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-neutral-400 mb-1">
                      Close Available After (Seconds)
                    </label>
                    <input
                      type="number"
                      min={1}
                      required
                      value={closeAfterSeconds}
                      onChange={(e) => setCloseAfterSeconds(parseInt(e.target.value, 10) || 15)}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2 text-xs outline-none text-white font-mono"
                    />
                    <span className="text-[10px] text-neutral-500 block mt-1">
                      Close button unlocks after this delay (Default: 15s).
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-neutral-400 mb-1">
                  Initial Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-sm outline-none focus:border-pink-500"
                >
                  <option value="active">Active</option>
                  <option value="draft">Draft</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="paused">Paused</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || uploadingMedia}
                  className="px-5 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingAd ? 'Update Ad' : 'Create Ad'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminAdvertisementsPage;
